import type { Env } from "../config/env.js";
import { RISK_LIMITS } from "../config/riskLimits.js";
import { AuditLog } from "../logging/auditLog.js";
import { WeightStore } from "../learning/weightStore.js";
import { TradeHistoryStore } from "../learning/tradeHistoryStore.js";
import { applyLearningUpdate } from "../learning/update.js";
import { generateReflection } from "../learning/reflection.js";
import { SafetyStateStore } from "../safety/state.js";
import { evaluateSafety, halt as haltSafety, resume as resumeSafety } from "../safety/killSwitch.js";
import { canRecordDayTrade, recordDayTrade } from "../safety/pdt.js";
import { computeSentiment } from "../sentiment/sentimentEngine.js";
import { SentimentCache } from "../sentiment/sentimentCache.js";
import { computeSymbolChatter } from "../social/chatterEngine.js";
import { ChatterCache } from "../social/chatterCache.js";
import { computeSignal } from "../strategy/signal.js";
import { computePositionSize } from "../execution/sizing.js";
import { buildOrderPlan } from "../execution/orderPlan.js";
import type { AssetClass } from "../config/watchlist.js";
import type { MarketTrendSnapshot } from "../sentiment/types.js";
import { assertSortedAscending, type OhlcvBar } from "../marketdata/types.js";
import type { Action, SignalKey } from "../strategy/types.js";

/** Wires the deterministic strategy/safety/learning modules to the stateful stores the MCP tools need. Constructed once per process, from env. */
export class ToolHandlers {
  private readonly weightStore: WeightStore;
  private readonly safetyStore: SafetyStateStore;
  private readonly sentimentCache: SentimentCache;
  private readonly chatterCache: ChatterCache;
  private readonly tradeHistory: TradeHistoryStore;
  private readonly auditLog: AuditLog;

  constructor(private readonly env: Env) {
    this.weightStore = new WeightStore(env.STATE_DIR);
    this.safetyStore = new SafetyStateStore(env.STATE_DIR);
    this.sentimentCache = new SentimentCache(env.STATE_DIR);
    this.chatterCache = new ChatterCache(env.STATE_DIR);
    this.tradeHistory = new TradeHistoryStore(env.STATE_DIR);
    this.auditLog = new AuditLog(env.AUDIT_LOG_DIR);
  }

  async getSentiment(marketTrend: MarketTrendSnapshot) {
    const result = await computeSentiment(marketTrend, { env: this.env });
    this.sentimentCache.set(result);
    this.auditLog.record({ type: "sentiment", ...result, marketTrend });
    return result;
  }

  /**
   * Per-symbol StockTwits/X chatter — unlike get_sentiment (one macro read
   * shared across the whole watchlist), this varies per symbol, so it's
   * cached per-symbol with a short TTL (ChatterCache) rather than by a
   * caller-controlled cadence. Safe to call every compute_decision cycle:
   * a fresh-enough cached entry is reused without a new fetch, keeping API
   * usage (especially the paid X tier) bounded.
   */
  async getSymbolChatter(symbol: string) {
    const cached = this.chatterCache.get(symbol);
    if (cached) return cached;

    const result = await computeSymbolChatter(symbol, { env: this.env });
    this.chatterCache.set(result);
    this.auditLog.record({ type: "sentiment", subtype: "social_chatter", ...result });
    return result;
  }

  computeDecision(symbol: string, bars: OhlcvBar[]) {
    // The MCP schema boundary doesn't (can't, via zod alone) enforce bar
    // ordering — every indicator/pattern detector assumes oldest-first and
    // will silently produce wrong results on newest-first input rather
    // than erroring, so fail fast here instead.
    assertSortedAscending(bars);
    const cachedSentiment = this.sentimentCache.get();
    const sentimentScore = cachedSentiment ? cachedSentiment.result.score : null;
    const cachedChatter = this.chatterCache.get(symbol);
    const chatterScore = cachedChatter ? cachedChatter.score : null;
    const decision = computeSignal(bars, sentimentScore, chatterScore, this.weightStore.get());
    const result = {
      symbol,
      mode: this.env.MODE,
      sentimentUsed: cachedSentiment ? { score: cachedSentiment.result.score, computedAt: cachedSentiment.computedAt, degraded: cachedSentiment.result.degraded } : null,
      chatterUsed: cachedChatter ? { score: cachedChatter.score, messageCount: cachedChatter.messageCount, degraded: cachedChatter.degraded } : null,
      ...decision,
    };
    this.auditLog.record({ type: "decision", ...result });
    return result;
  }

  checkSafety(currentEquity: number, marginMaintenanceUtilization: number | null) {
    const state = this.safetyStore.get();
    const result = evaluateSafety(state, { currentEquity, marginMaintenanceUtilization });
    this.safetyStore.save(result.updatedState);
    // Log only a genuinely NEW auto-halt: compare the persisted
    // autoHaltReason before vs. after this call, not the returned reason
    // string against it — evaluateSafety's already-halted early-return
    // (manual or auto) leaves state unchanged, so this stays false there
    // and doesn't spam the log with a mislabeled duplicate every time
    // checkSafety is polled while already halted (manually or otherwise).
    if (result.updatedState.autoHaltReason && result.updatedState.autoHaltReason !== state.autoHaltReason) {
      this.auditLog.record({ type: "halt", reason: result.updatedState.autoHaltReason, source: "auto" });
    }
    return { halted: result.halted, reason: result.reason };
  }

  sizeOrder(input: { symbol: string; currentPrice: number; action: Action; confidence: number; score: number; contributingSignals: Array<{ key: SignalKey; vote: number; weight: number; detail: string }>; cash: number; maxMarginBuyingPower: number; bars: OhlcvBar[] }) {
    // Same ordering assumption as computeDecision — computePositionSize's
    // ATR call needs oldest-first bars too.
    assertSortedAscending(input.bars);
    const sizing = computePositionSize({
      cash: input.cash,
      maxMarginBuyingPower: input.maxMarginBuyingPower,
      marginEnabled: this.env.MARGIN_ENABLED,
      confidence: input.confidence,
      bars: input.bars,
    });
    const decision = { action: input.action, confidence: input.confidence, score: input.score, contributingSignals: input.contributingSignals };
    const plan = buildOrderPlan(input.symbol, input.currentPrice, decision, sizing);
    const executeOrder = plan !== null && this.env.MODE === "live";
    const result = { sizing, plan, executeOrder, mode: this.env.MODE };
    // Include the symbol and core decision inputs alongside the sizing
    // result — without them, an order-event log line (especially a HOLD,
    // where plan is null) can't be correlated back to the decision that
    // produced it.
    this.auditLog.record({ type: "order", symbol: input.symbol, action: input.action, score: input.score, confidence: input.confidence, ...result });
    return result;
  }

  async recordOutcome(input: { symbol: string; assetClass: AssetClass; action: "BUY" | "SELL"; decisionScore: number; contributingSignals: Array<{ key: SignalKey; vote: number }>; realizedReturnPct: number; isDayTrade: boolean; currentEquity: number; closedAt?: string }) {
    const closedAt = input.closedAt ?? new Date().toISOString();
    // Use the trade's actual close time for PDT dating, not "now" —
    // record_outcome can be called after midnight or with a delay, and
    // canRecordDayTrade/recordDayTrade default to `new Date()` if not told
    // otherwise, which would date the trade to the wrong day and throw off
    // the rolling PDT window.
    const closedAtDate = new Date(closedAt);

    if (input.isDayTrade) {
      const pdtCheck = canRecordDayTrade(this.safetyStore.get(), input.assetClass, input.currentEquity, closedAtDate);
      // The trade already happened by the time this is recorded — this
      // just keeps the PDT counter accurate for the *next* check, it can't
      // retroactively block what already executed.
      if (input.assetClass === "equity") {
        this.safetyStore.save(recordDayTrade(this.safetyStore.get(), input.symbol, closedAtDate));
      }
      if (!pdtCheck.allowed) {
        this.auditLog.record({ type: "order", symbol: input.symbol, warning: pdtCheck.reason });
      }
    }

    const { weights, adjustments } = applyLearningUpdate(this.weightStore.get(), input.contributingSignals, input.decisionScore, input.realizedReturnPct);
    this.weightStore.save(weights);
    this.auditLog.record({ type: "learning_update", symbol: input.symbol, realizedReturnPct: input.realizedReturnPct, adjustments });

    this.tradeHistory.append({
      trade: { symbol: input.symbol, action: input.action, realizedReturnPct: input.realizedReturnPct, closedAt },
      adjustments,
    });

    return { weights, adjustments };
  }

  halt(reason: string) {
    this.safetyStore.save(haltSafety(this.safetyStore.get(), reason));
    this.auditLog.record({ type: "halt", reason, source: "manual" });
    return { halted: true, reason };
  }

  resume() {
    this.safetyStore.save(resumeSafety(this.safetyStore.get()));
    this.auditLog.record({ type: "resume" });
    return { halted: false };
  }

  getStatus() {
    const safety = this.safetyStore.get();
    return {
      mode: this.env.MODE,
      halted: safety.manuallyHalted || safety.autoHaltReason !== null,
      manuallyHalted: safety.manuallyHalted,
      autoHaltReason: safety.autoHaltReason,
      dayStartEquity: safety.dayStartEquity,
      dayStartDateIso: safety.dayStartDateIso,
      pdtTradeCount: safety.pdtTrades.length,
      weights: this.weightStore.get(),
      riskLimits: RISK_LIMITS,
    };
  }

  async generateReflection() {
    const recent = this.tradeHistory.recent(10);
    const rationale = await generateReflection(
      this.env,
      recent.map((e) => e.trade),
      recent.flatMap((e) => e.adjustments),
    );
    if (rationale) this.auditLog.record({ type: "learning_update", reflection: rationale });
    return { rationale };
  }
}
