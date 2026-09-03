import type { ChatterMessage } from "../types.js";

/**
 * StockTwits' public symbol stream — no API key required for read access
 * (rate-limited more aggressively without one). Purpose-built for
 * per-ticker chatter, with an optional author-supplied bullish/bearish
 * tag on each message, unlike general social platforms.
 */
export class StockTwitsSymbolChatter {
  readonly name = "stocktwits";

  async fetchMessages(symbol: string): Promise<ChatterMessage[]> {
    const url = `https://api.stocktwits.com/api/2/streams/symbol/${encodeURIComponent(symbol)}.json`;
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`StockTwits fetch failed: ${response.status} ${response.statusText}`);
    }
    const body = (await response.json()) as {
      messages: Array<{ body: string; created_at: string; id: number; entities?: { sentiment?: { basic: "Bullish" | "Bearish" } | null } }>;
    };
    return body.messages.slice(0, 30).map((m) => ({
      source: "stocktwits" as const,
      text: m.body,
      authorSentimentTag: m.entities?.sentiment?.basic === "Bullish" ? "bullish" : m.entities?.sentiment?.basic === "Bearish" ? "bearish" : null,
      publishedAt: m.created_at,
      url: `https://stocktwits.com/symbol/${encodeURIComponent(symbol)}/message/${m.id}`,
    }));
  }
}
