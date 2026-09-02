/**
 * Every input `strategy/signal.ts` can vote with. This is also the key set
 * `learning/` adjusts weights for — keeping one shared enum means a typo
 * can't silently create an untracked, unweighted signal.
 */
export const SIGNAL_KEYS = ["candlestick", "trend", "momentum_rsi", "momentum_macd", "volatility_bbands", "sentiment"] as const;
export type SignalKey = (typeof SIGNAL_KEYS)[number];

export type SignalWeights = Record<SignalKey, number>;

export const DEFAULT_SIGNAL_WEIGHTS: SignalWeights = {
  candlestick: 1,
  trend: 1,
  momentum_rsi: 1,
  momentum_macd: 1,
  volatility_bbands: 1,
  sentiment: 1,
};

/** A single signal's vote before weighting: -1 (fully bearish) to +1 (fully bullish). */
export interface SignalVote {
  key: SignalKey;
  vote: number;
  /** Human-readable detail for the audit log (e.g. which candlestick patterns fired). */
  detail: string;
}

export type Action = "BUY" | "SELL" | "HOLD";

export interface Decision {
  action: Action;
  /** 0-1: how strongly the weighted signals agree. */
  confidence: number;
  /** Weighted average vote in [-1, 1] before thresholding into an action. */
  score: number;
  contributingSignals: Array<SignalVote & { weight: number; contribution: number }>;
}
