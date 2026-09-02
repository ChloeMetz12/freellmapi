export type AssetClass = "equity" | "crypto";

export interface WatchedSymbol {
  symbol: string;
  assetClass: AssetClass;
}

/**
 * Placeholder default watchlist. This is a config decision the user should
 * override, not something the agent should silently trade with — replace
 * with the actual symbols to run the strategy against.
 */
export const DEFAULT_WATCHLIST: WatchedSymbol[] = [
  { symbol: "SPY", assetClass: "equity" },
  { symbol: "QQQ", assetClass: "equity" },
  { symbol: "BTC-USD", assetClass: "crypto" },
];

/** Index/ETF proxies used for the market-trend half of sentiment/. */
export const MARKET_TREND_PROXIES = {
  broadMarket: "SPY",
  tech: "QQQ",
  volatility: "VIX",
} as const;
