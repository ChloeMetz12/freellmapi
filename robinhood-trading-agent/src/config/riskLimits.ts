/**
 * Risk-limit constants. These are the load-bearing guardrails referenced
 * throughout the plan — changing them changes how much capital the agent
 * can lose, not just a tuning knob, so treat edits here as risk decisions.
 *
 * `RISK_LIMITS` is a mutable singleton (not `as const`) specifically so
 * `applyEnvRiskOverrides` can hydrate the handful of fields that are also
 * exposed as env vars (see `.env.example`) — without that call, changing
 * those env vars would silently have no effect on the actual guardrails.
 * Every module that imports `RISK_LIMITS` reads the same object reference,
 * so calling `applyEnvRiskOverrides` once at process startup, before any
 * request is handled, is sufficient.
 */

export interface RiskLimits {
  dailyLossHaltFraction: number;
  marginUtilizationCap: number;
  marginCallWarningThreshold: number;
  pdtEquityThresholdUsd: number;
  pdtMaxDayTrades: number;
  pdtRollingWindowDays: number;
  volatilityScalarMin: number;
  volatilityScalarMax: number;
  volumeConfirmationMultiplier: number;
  volumeConfirmationDiscount: number;
  rsiOverbought: number;
  rsiOversold: number;
  learning: {
    stepSize: number;
    minWeight: number;
    maxWeight: number;
  };
  /**
   * Gates whether check_live_readiness reports the dry-run track record as
   * ready for a human to consider flipping MODE=live. This is a
   * notify-only gate, deliberately: it never flips MODE itself. See
   * learning/liveReadiness.ts.
   */
  liveReadiness: {
    /** Below this many closed dry-run trades, "profitable" is mostly noise. */
    minTrades: number;
    /** Minimum calendar-day span from the first to the last trade in the window, so the sample isn't just one lucky week. */
    minTradingDaySpan: number;
    /** Minimum fraction of trades with a positive realizedReturnPct. */
    minWinRate: number;
    /** No single trade's gain may exceed this fraction of total gains — catches a record "carried" by one outlier. */
    maxSingleTradeGainShare: number;
  };
}

export const RISK_LIMITS: RiskLimits = {
  /** Hard kill-switch: halt all trading if today's equity drop exceeds this fraction. */
  dailyLossHaltFraction: 0.1,

  /** Never let execution/ consume the last slice of margin capacity. */
  marginUtilizationCap: 0.8,

  /**
   * Fraction of the way toward a broker margin call (0-1, per the broker's
   * own maintenance-margin utilization figure) that triggers an immediate
   * halt — separate from, and checked more urgently than, the daily-loss
   * halt below.
   */
  marginCallWarningThreshold: 0.9,

  /** FINRA pattern-day-trader rule: below this equity, day trades are limited. */
  pdtEquityThresholdUsd: 25_000,
  pdtMaxDayTrades: 3,
  pdtRollingWindowDays: 5,

  /** Volatility-based sizing scalar bounds (ATR baseline / ATR current, clamped). */
  volatilityScalarMin: 0.25,
  volatilityScalarMax: 1.0,

  /** A candlestick/breakout signal below this relative-volume ratio is discounted. */
  volumeConfirmationMultiplier: 1.5,
  volumeConfirmationDiscount: 0.5,

  /** RSI(14) thresholds. */
  rsiOverbought: 70,
  rsiOversold: 30,

  /** learning/: bounded online weight-update rule. */
  learning: {
    /** Max fraction a single weight can move per closed trade. */
    stepSize: 0.05,
    /** Absolute clamp — no signal's weight can dominate or zero out entirely. */
    minWeight: 0.1,
    maxWeight: 3.0,
  },

  /** check_live_readiness's dry-run-to-live graduation criteria (notify-only, see learning/liveReadiness.ts). */
  liveReadiness: {
    minTrades: 50,
    minTradingDaySpan: 14,
    minWinRate: 0.45,
    maxSingleTradeGainShare: 0.5,
  },
};

/**
 * Hydrates the subset of `RISK_LIMITS` that `.env.example` documents as
 * configurable (`DAILY_LOSS_HALT_PCT`, `MARGIN_UTILIZATION_CAP`,
 * `PDT_EQUITY_THRESHOLD_USD`). Call once at process startup, right after
 * `loadEnv()`, before constructing anything that reads `RISK_LIMITS`.
 */
export function applyEnvRiskOverrides(env: { DAILY_LOSS_HALT_PCT: number; MARGIN_UTILIZATION_CAP: number; PDT_EQUITY_THRESHOLD_USD: number }): void {
  RISK_LIMITS.dailyLossHaltFraction = env.DAILY_LOSS_HALT_PCT;
  RISK_LIMITS.marginUtilizationCap = env.MARGIN_UTILIZATION_CAP;
  RISK_LIMITS.pdtEquityThresholdUsd = env.PDT_EQUITY_THRESHOLD_USD;
}
