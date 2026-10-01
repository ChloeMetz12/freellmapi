import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ToolHandlers } from "../../src/mcp/toolHandlers.js";
import type { Env } from "../../src/config/env.js";
import type { OhlcvBar } from "../../src/marketdata/types.js";

let dir: string | undefined;

afterEach(() => {
  if (dir) rmSync(dir, { recursive: true, force: true });
  dir = undefined;
});

function makeEnv(stateDir: string, overrides: Partial<Env> = {}): Env {
  return {
    MODE: "dry-run",
    MCP_HTTP_PORT: 8787,
    MCP_AUTH_TOKEN: "test-token",
    STATE_DIR: stateDir,
    AUDIT_LOG_DIR: join(stateDir, "runs"),
    DAILY_LOSS_HALT_PCT: 0.1,
    MARGIN_UTILIZATION_CAP: 0.8,
    MARGIN_ENABLED: true,
    PDT_EQUITY_THRESHOLD_USD: 25_000,
    DECISION_THRESHOLD: 0.15,
    LONG_ONLY: false,
    LLM_GATEWAY_URL: "http://localhost:3000/v1",
    SENTIMENT_MODEL: "gpt-4o-mini",
    ...overrides,
  };
}

function barsFromCloses(closes: number[], order: "ascending" | "descending" = "ascending"): OhlcvBar[] {
  const bars = closes.map((close, i) => ({
    timestamp: new Date(2026, 0, 1, 0, i).toISOString(),
    open: close,
    high: close,
    low: close,
    close,
    volume: 1_000_000,
  }));
  return order === "ascending" ? bars : bars.reverse();
}

describe("ToolHandlers.computeDecision", () => {
  it("rejects newest-first bars instead of silently computing wrong indicator values", () => {
    dir = mkdtempSync(join(tmpdir(), "tool-handlers-"));
    const handlers = new ToolHandlers(makeEnv(dir));
    const closes = Array.from({ length: 30 }, (_, i) => 100 + i);
    expect(() => handlers.computeDecision("SPY", barsFromCloses(closes, "descending"))).toThrow(/sorted oldest-first/);
  });

  it("accepts oldest-first bars", () => {
    dir = mkdtempSync(join(tmpdir(), "tool-handlers-"));
    const handlers = new ToolHandlers(makeEnv(dir));
    const closes = Array.from({ length: 30 }, (_, i) => 100 + i);
    expect(() => handlers.computeDecision("SPY", barsFromCloses(closes, "ascending"))).not.toThrow();
  });
});

describe("ToolHandlers.recordOutcome", () => {
  it("dates the PDT record by the trade's closedAt, not by when record_outcome happens to be called", async () => {
    dir = mkdtempSync(join(tmpdir(), "tool-handlers-"));
    const handlers = new ToolHandlers(makeEnv(dir));

    await handlers.recordOutcome({
      symbol: "AAPL",
      assetClass: "equity",
      action: "BUY",
      decisionScore: 0.5,
      contributingSignals: [],
      realizedReturnPct: 0.01,
      isDayTrade: true,
      currentEquity: 10_000,
      closedAt: "2026-01-15T23:00:00.000Z", // deliberately not "today"
    });

    const state = JSON.parse(readFileSync(join(dir, "safety-state.json"), "utf-8"));
    expect(state.pdtTrades).toEqual([{ symbol: "AAPL", dateIso: "2026-01-15" }]);
  });
});

describe("ToolHandlers paper-position flow", () => {
  it("opens, lists, and closes a paper position, feeding the same path recordOutcome would", async () => {
    dir = mkdtempSync(join(tmpdir(), "tool-handlers-"));
    const handlers = new ToolHandlers(makeEnv(dir));

    const opened = handlers.openPaperPosition({
      symbol: "AAPL",
      assetClass: "equity",
      action: "BUY",
      entryPrice: 200,
      quantity: 1,
      decisionScore: 0.5,
      contributingSignals: [],
      openedAt: "2026-01-15T14:00:00.000Z",
    });
    expect(opened.opened).toBe(true);
    expect(handlers.getPaperPositions().positions).toHaveLength(1);

    const closed = await handlers.closePaperPosition({
      symbol: "AAPL",
      exitPrice: 220,
      currentEquity: 10_000,
      closedAt: "2026-01-15T20:00:00.000Z",
    });

    expect(closed.closed).toBe(true);
    expect(closed.realizedReturnPct).toBeCloseTo(0.1, 10);
    expect(handlers.getPaperPositions().positions).toHaveLength(0);

    const readiness = handlers.checkLiveReadiness();
    expect(readiness.tradeCount).toBe(1);
    expect(readiness.cumulativeReturnPct).toBeCloseTo(0.1, 10);
  });

  it("computes a positive return for a short (SELL) paper position when price falls", async () => {
    dir = mkdtempSync(join(tmpdir(), "tool-handlers-"));
    const handlers = new ToolHandlers(makeEnv(dir));

    handlers.openPaperPosition({
      symbol: "AAPL",
      assetClass: "equity",
      action: "SELL",
      entryPrice: 200,
      quantity: 1,
      decisionScore: -0.5,
      contributingSignals: [],
      openedAt: "2026-01-15T14:00:00.000Z",
    });

    const closed = await handlers.closePaperPosition({
      symbol: "AAPL",
      exitPrice: 180,
      currentEquity: 10_000,
      closedAt: "2026-01-15T20:00:00.000Z",
    });

    expect(closed.realizedReturnPct).toBeCloseTo(0.1, 10);
  });

  it("refuses to open a second position for a symbol that already has one open", () => {
    dir = mkdtempSync(join(tmpdir(), "tool-handlers-"));
    const handlers = new ToolHandlers(makeEnv(dir));

    handlers.openPaperPosition({ symbol: "AAPL", assetClass: "equity", action: "BUY", entryPrice: 200, quantity: 1, decisionScore: 0.5, contributingSignals: [] });
    const second = handlers.openPaperPosition({ symbol: "AAPL", assetClass: "equity", action: "BUY", entryPrice: 205, quantity: 1, decisionScore: 0.5, contributingSignals: [] });

    expect(second.opened).toBe(false);
    expect(handlers.getPaperPositions().positions).toHaveLength(1);
  });

  it("reports closed=false for a symbol with no open paper position", async () => {
    dir = mkdtempSync(join(tmpdir(), "tool-handlers-"));
    const handlers = new ToolHandlers(makeEnv(dir));

    const closed = await handlers.closePaperPosition({ symbol: "AAPL", exitPrice: 200, currentEquity: 10_000 });
    expect(closed.closed).toBe(false);
  });

  it("marks a same-day round trip as a PDT day trade", async () => {
    dir = mkdtempSync(join(tmpdir(), "tool-handlers-"));
    const handlers = new ToolHandlers(makeEnv(dir));

    handlers.openPaperPosition({
      symbol: "AAPL",
      assetClass: "equity",
      action: "BUY",
      entryPrice: 200,
      quantity: 1,
      decisionScore: 0.5,
      contributingSignals: [],
      openedAt: "2026-01-15T14:00:00.000Z",
    });
    await handlers.closePaperPosition({ symbol: "AAPL", exitPrice: 205, currentEquity: 10_000, closedAt: "2026-01-15T20:00:00.000Z" });

    const state = JSON.parse(readFileSync(join(dir, "safety-state.json"), "utf-8"));
    expect(state.pdtTrades).toEqual([{ symbol: "AAPL", dateIso: "2026-01-15" }]);
  });
});

describe("ToolHandlers.sizeOrder dry-run paper floor", () => {
  it("returns a non-null plan in dry-run when broker cash/margin are $0 so paper positions can open", () => {
    dir = mkdtempSync(join(tmpdir(), "tool-handlers-"));
    const handlers = new ToolHandlers(makeEnv(dir));
    const closes = Array.from({ length: 30 }, (_, i) => 100 + (i % 3));
    const result = handlers.sizeOrder({
      symbol: "BTC-USD",
      currentPrice: 100,
      action: "BUY",
      confidence: 0.2,
      score: 0.2,
      contributingSignals: [],
      cash: 0,
      maxMarginBuyingPower: 0,
      bars: barsFromCloses(closes),
    });
    expect(result.usedDryRunPaperBuyingPower).toBe(true);
    expect(result.plan).not.toBeNull();
    expect(result.plan!.notionalUsd).toBeGreaterThan(0);
    expect(result.executeOrder).toBe(false);
  });
});

describe("ToolHandlers.checkLiveReadiness", () => {
  it("reflects trades recorded via recordOutcome, including currentEquity", async () => {
    dir = mkdtempSync(join(tmpdir(), "tool-handlers-"));
    const handlers = new ToolHandlers(makeEnv(dir));

    await handlers.recordOutcome({
      symbol: "AAPL",
      assetClass: "equity",
      action: "BUY",
      decisionScore: 0.5,
      contributingSignals: [],
      realizedReturnPct: 0.02,
      isDayTrade: false,
      currentEquity: 10_200,
      closedAt: "2026-09-08T23:00:00.000Z",
    });

    const result = handlers.checkLiveReadiness();
    expect(result.tradeCount).toBe(1);
    expect(result.cumulativeReturnPct).toBeCloseTo(0.02, 10);
    // Nowhere near the graduation thresholds off a single trade.
    expect(result.ready).toBe(false);
  });
});

describe("ToolHandlers strictness (DECISION_THRESHOLD / LONG_ONLY)", () => {
  const closes = Array.from({ length: 30 }, (_, i) => 100 + i);
  const sellInput = (heldQuantity?: number) => ({
    symbol: "AAPL",
    currentPrice: 100,
    action: "SELL" as const,
    confidence: 0.5,
    score: -0.5,
    contributingSignals: [],
    cash: 10_000,
    maxMarginBuyingPower: 0,
    bars: barsFromCloses(closes),
    heldQuantity,
  });

  it("applies DECISION_THRESHOLD in both dry-run and live", () => {
    for (const MODE of ["dry-run", "live"] as const) {
      dir = mkdtempSync(join(tmpdir(), "tool-handlers-"));
      const handlers = new ToolHandlers(makeEnv(dir, { MODE, DECISION_THRESHOLD: 1 }));
      const result = handlers.computeDecision("SPY", barsFromCloses(closes));
      expect(result.decisionThreshold).toBe(1);
      expect(result.action).toBe("HOLD");
      rmSync(dir, { recursive: true, force: true });
    }
    dir = undefined;
  });

  it("refuses to open a paper short when LONG_ONLY is on, but still opens longs", () => {
    dir = mkdtempSync(join(tmpdir(), "tool-handlers-"));
    const handlers = new ToolHandlers(makeEnv(dir, { LONG_ONLY: true }));

    const short = handlers.openPaperPosition({ symbol: "AAPL", assetClass: "equity", action: "SELL", entryPrice: 200, quantity: 1, decisionScore: -0.5, contributingSignals: [] });
    expect(short.opened).toBe(false);
    expect(short.reason).toMatch(/long-only/);
    expect(handlers.getPaperPositions().positions).toHaveLength(0);

    const long = handlers.openPaperPosition({ symbol: "AAPL", assetClass: "equity", action: "BUY", entryPrice: 200, quantity: 1, decisionScore: 0.5, contributingSignals: [] });
    expect(long.opened).toBe(true);
  });

  it("live + LONG_ONLY: a SELL with nothing held produces no order", () => {
    dir = mkdtempSync(join(tmpdir(), "tool-handlers-"));
    const handlers = new ToolHandlers(makeEnv(dir, { MODE: "live", LONG_ONLY: true }));
    const result = handlers.sizeOrder(sellInput());
    expect(result.plan).toBeNull();
    expect(result.executeOrder).toBe(false);
    expect(result.longOnly?.shortBlocked).toBe(true);
  });

  it("live + LONG_ONLY: a SELL exits exactly the held quantity, not a confidence-sized amount", () => {
    dir = mkdtempSync(join(tmpdir(), "tool-handlers-"));
    const handlers = new ToolHandlers(makeEnv(dir, { MODE: "live", LONG_ONLY: true }));
    const result = handlers.sizeOrder(sellInput(3));
    expect(result.plan).toMatchObject({ side: "SELL", estimatedShares: 3, notionalUsd: 300 });
    expect(result.executeOrder).toBe(true);
  });

  it("without LONG_ONLY, SELL sizing is unchanged", () => {
    dir = mkdtempSync(join(tmpdir(), "tool-handlers-"));
    const handlers = new ToolHandlers(makeEnv(dir, { MODE: "live", LONG_ONLY: false }));
    const result = handlers.sizeOrder(sellInput());
    expect(result.plan?.side).toBe("SELL");
    expect(result.sizing).not.toBeNull();
  });
});

describe("ToolHandlers.checkLiveReadiness with READINESS_SINCE", () => {
  it("counts only positions opened at/after READINESS_SINCE, keeping the full history", async () => {
    dir = mkdtempSync(join(tmpdir(), "tool-handlers-"));
    const handlers = new ToolHandlers(makeEnv(dir, { READINESS_SINCE: "2026-10-01T18:00:00.000Z" }));

    await handlers.recordOutcome({ symbol: "OLD", assetClass: "equity", action: "BUY", decisionScore: 0.5, contributingSignals: [], realizedReturnPct: -0.05, isDayTrade: false, currentEquity: 10_000, closedAt: "2026-09-30T20:00:00.000Z" });
    handlers.openPaperPosition({ symbol: "PRE", assetClass: "equity", action: "BUY", entryPrice: 100, quantity: 1, decisionScore: 0.5, contributingSignals: [], openedAt: "2026-10-01T15:00:00.000Z" });
    await handlers.closePaperPosition({ symbol: "PRE", exitPrice: 90, currentEquity: 10_000, closedAt: "2026-10-02T15:00:00.000Z" });
    handlers.openPaperPosition({ symbol: "NEW", assetClass: "equity", action: "BUY", entryPrice: 100, quantity: 1, decisionScore: 0.5, contributingSignals: [], openedAt: "2026-10-01T19:00:00.000Z" });
    await handlers.closePaperPosition({ symbol: "NEW", exitPrice: 110, currentEquity: 10_000, closedAt: "2026-10-02T15:00:00.000Z" });

    const result = handlers.checkLiveReadiness();
    expect(result.tradeCount).toBe(1);
    expect(result.cumulativeReturnPct).toBeCloseTo(0.1, 10);
    expect(result.excludedTradeCount).toBe(2);
    expect(result.readinessSince).toBe("2026-10-01T18:00:00.000Z");
  });
});
