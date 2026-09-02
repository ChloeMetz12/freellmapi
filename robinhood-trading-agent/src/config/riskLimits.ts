/**
 * Risk-limit constants. These are the load-bearing guardrails referenced
 * throughout the plan — changing them changes how much capital the agent
 * can lose, not just a tuning knob, so treat edits here as risk decisions.
 */

export const RISK_LIMITS = {
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
} as const;
