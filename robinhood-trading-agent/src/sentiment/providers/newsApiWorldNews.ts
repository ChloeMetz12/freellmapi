import type { NewsHeadline, NewsProvider } from "../types.js";

/**
 * World/political headlines via NewsAPI.org's `/v2/top-headlines`.
 *
 * NOTE: NewsAPI's free "Developer" plan explicitly disallows production/
 * commercial use — see the plan's Open Risks. This needs a paid plan (or a
 * provider swap) before MODE=live; this class only implements the fetch,
 * it doesn't enforce that licensing constraint.
 */
export class NewsApiWorldNews implements NewsProvider {
  readonly name = "newsapi-world-news";

  constructor(private readonly apiKey: string) {}

  async fetchHeadlines(): Promise<NewsHeadline[]> {
    const url = `https://newsapi.org/v2/top-headlines?category=general&language=en&pageSize=20&apiKey=${encodeURIComponent(this.apiKey)}`;
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`NewsAPI fetch failed: ${response.status} ${response.statusText}`);
    }
    const body = (await response.json()) as { articles: Array<{ title: string; source: { name: string }; publishedAt: string; url: string }> };
    return body.articles.map((item) => ({
      title: item.title,
      source: item.source.name,
      publishedAt: item.publishedAt,
      url: item.url,
    }));
  }
}
