export interface XPost {
  id: string;
  text: string;
  authorId: string;
  createdAt: string;
}

/**
 * Shared low-level client for X's recent-search endpoint — used both for
 * per-symbol ticker chatter (src/social/) and macro/world news (src/sentiment/).
 * Auth is a Bearer token in the Authorization header, not a URL query
 * param, so unlike the Finnhub/NewsAPI providers there's no API-key-in-URL
 * leak vector here — a fetch-level error's message won't contain the token.
 */
export async function searchRecentTweets(bearerToken: string, query: string, maxResults = 25): Promise<XPost[]> {
  const url = new URL("https://api.x.com/2/tweets/search/recent");
  url.searchParams.set("query", query);
  url.searchParams.set("max_results", String(Math.min(Math.max(maxResults, 10), 100)));
  url.searchParams.set("tweet.fields", "created_at,author_id");

  const response = await fetch(url, { headers: { Authorization: `Bearer ${bearerToken}` } });
  if (!response.ok) {
    throw new Error(`X search failed: ${response.status} ${response.statusText}`);
  }
  const body = (await response.json()) as { data?: Array<{ id: string; text: string; author_id: string; created_at: string }> };
  return (body.data ?? []).map((t) => ({ id: t.id, text: t.text, authorId: t.author_id, createdAt: t.created_at }));
}
