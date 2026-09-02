export interface NewsHeadline {
  title: string;
  source: string;
  publishedAt: string;
  url: string;
}

export interface NewsProvider {
  name: string;
  fetchHeadlines(): Promise<NewsHeadline[]>;
}

export interface MarketTrendSnapshot {
  /** e.g. SPY daily % change */
  broadMarketChangePct: number;
  /** e.g. QQQ daily % change */
  techChangePct: number;
  /** VIX level */
  volatilityIndex: number;
}

export interface SentimentResult {
  /** -1 (very bearish/high-risk) to +1 (very bullish/low-risk). */
  score: number;
  /** 0-1: the model's own confidence in this read. */
  confidence: number;
  rationale: string;
  /** Full step-by-step reasoning, kept for audit-log interpretability. */
  scratchpad: string;
  /** True if this is a fallback ("neutral") value because a real read failed. */
  degraded: boolean;
}

export const NEUTRAL_SENTIMENT = (reason: string): SentimentResult => ({
  score: 0,
  confidence: 0,
  rationale: `degraded to neutral: ${reason}`,
  scratchpad: "",
  degraded: true,
});
