import type { NewsHeadline, NewsProvider } from "../types.js";

/** Financial/company-specific headlines via Finnhub's free-tier `/news` endpoint. */
export class FinnhubMarketNews implements NewsProvider {
  readonly name = "finnhub-market-news";

  constructor(private readonly apiKey: string) {}

  async fetchHeadlines(): Promise<NewsHeadline[]> {
    const url = `https://finnhub.io/api/v1/news?category=general&token=${encodeURIComponent(this.apiKey)}`;
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Finnhub news fetch failed: ${response.status} ${response.statusText}`);
    }
    const body = (await response.json()) as Array<{ headline: string; source: string; datetime: number; url: string }>;
    return body.slice(0, 20).map((item) => ({
      title: item.headline,
      source: item.source,
      publishedAt: new Date(item.datetime * 1000).toISOString(),
      url: item.url,
    }));
  }
}
