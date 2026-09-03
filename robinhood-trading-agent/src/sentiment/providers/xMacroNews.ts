import { searchRecentTweets } from "../../util/xClient.js";
import type { NewsHeadline, NewsProvider } from "../types.js";

/**
 * World/political/finance headlines via X, scoped to a curated set of
 * wire-service and official accounts rather than open keyword search —
 * an open search for e.g. "market crash" would pull in exactly the kind
 * of unverified/sensational chatter the sentiment prompt is told to
 * discount. Requires the paid Basic API tier or above.
 */
const CURATED_ACCOUNTS = ["Reuters", "AP", "business", "federalreserve", "WSJ"];

export class XMacroNews implements NewsProvider {
  readonly name = "x-macro";

  constructor(private readonly bearerToken: string) {}

  async fetchHeadlines(): Promise<NewsHeadline[]> {
    const query = `(${CURATED_ACCOUNTS.map((a) => `from:${a}`).join(" OR ")}) -is:retweet lang:en`;
    const posts = await searchRecentTweets(this.bearerToken, query, 20);
    return posts.map((p) => ({
      title: p.text,
      source: "x",
      publishedAt: p.createdAt,
      url: `https://x.com/i/web/status/${p.id}`,
    }));
  }
}
