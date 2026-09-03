export interface ChatterMessage {
  source: "stocktwits" | "x";
  text: string;
  /** StockTwits' own bull/bear self-tag on a message, when the author set one. X posts never have this. */
  authorSentimentTag: "bullish" | "bearish" | null;
  publishedAt: string;
  url: string;
}

export interface SymbolChatterResult {
  symbol: string;
  /** -1 (very bearish chatter) to +1 (very bullish chatter). */
  score: number;
  /** 0-1: how confident the read is — low when volume is thin or messages are contradictory. */
  confidence: number;
  rationale: string;
  scratchpad: string;
  messageCount: number;
  degraded: boolean;
}

export const NEUTRAL_CHATTER = (symbol: string, reason: string): SymbolChatterResult => ({
  symbol,
  score: 0,
  confidence: 0,
  rationale: `degraded to neutral: ${reason}`,
  scratchpad: "",
  messageCount: 0,
  degraded: true,
});
