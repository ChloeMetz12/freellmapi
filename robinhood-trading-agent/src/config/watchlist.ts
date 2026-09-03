export type AssetClass = "equity" | "crypto";

/**
 * Deliberately no watchlist/allowlist here: per the user's explicit
 * choice, the symbol universe is unrestricted — compute_decision,
 * size_order, and record_outcome all accept any symbol the calling
 * session passes, with no allowlist check anywhere in this package. See
 * README's "Unrestricted symbol universe" section for what backstops
 * still apply (safety/ guardrails are symbol-agnostic and check every
 * order regardless of which symbol it's for).
 */

/** Index/ETF proxies used for the market-trend half of sentiment/. */
export const MARKET_TREND_PROXIES = {
  broadMarket: "SPY",
  tech: "QQQ",
  volatility: "VIX",
} as const;
