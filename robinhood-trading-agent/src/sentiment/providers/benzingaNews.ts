import type { NewsHeadline, NewsProvider } from "../types.js";

/** Benzinga's real-time news API (paid). */
export class BenzingaNews implements NewsProvider {
  readonly name = "benzinga";

  constructor(private readonly apiKey: string) {}

  async fetchHeadlines(): Promise<NewsHeadline[]> {
    const url = `https://api.benzinga.com/api/v2/news?token=${encodeURIComponent(this.apiKey)}&pageSize=20&displayOutput=full`;
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Benzinga news fetch failed: ${response.status} ${response.statusText}`);
    }
    const body = (await response.json()) as Array<{ title: string; created: string; url: string }>;
    return body.map((item) => ({
      title: item.title,
      source: "benzinga",
      publishedAt: item.created,
      url: item.url,
    }));
  }
}
