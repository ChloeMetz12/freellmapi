import { searchRecentTweets } from "../../util/xClient.js";
import type { ChatterMessage } from "../types.js";

/** X posts mentioning a specific ticker (via cashtag search, e.g. "$AAPL"). Requires the paid Basic API tier or above — the free tier's read limits are too low for per-symbol search at trading cadence. */
export class XTickerChatter {
  readonly name = "x";

  constructor(private readonly bearerToken: string) {}

  async fetchMessages(symbol: string): Promise<ChatterMessage[]> {
    const posts = await searchRecentTweets(this.bearerToken, `$${symbol} lang:en -is:retweet`, 30);
    return posts.map((p) => ({
      source: "x" as const,
      text: p.text,
      authorSentimentTag: null,
      publishedAt: p.createdAt,
      url: `https://x.com/i/web/status/${p.id}`,
    }));
  }
}
