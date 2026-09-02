export type PatternDirection = "bullish" | "bearish";

export interface PatternMatch {
  name: string;
  direction: PatternDirection;
  /** 0-1: how cleanly the bars matched the pattern's ideal geometry. */
  strength: number;
}

/**
 * Several patterns (hammer/hanging-man, shooting-star/inverted-hammer) have
 * identical candle geometry and differ only by whether they follow an
 * uptrend or downtrend. Detectors take the prevailing trend (as already
 * computed by the EMA crossover indicator) to disambiguate rather than
 * guessing from candle color alone.
 */
export type TrendContext = "up" | "down" | "neutral";
