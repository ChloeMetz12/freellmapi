import type { NewsHeadline, NewsProvider } from "../types.js";

/**
 * CoinGecko's free-tier global/trending endpoints — no API key required
 * (an optional demo key raises rate limits but isn't needed for this).
 * Not headlines in the traditional sense; synthesizes one summary
 * "headline" describing BTC dominance and today's trending coins so it
 * slots into the same LLM prompt as the other providers' real headlines.
 */
export class CoinGeckoMarket implements NewsProvider {
  readonly name = "coingecko";

  constructor(private readonly apiKey?: string) {}

  private headers(): Record<string, string> {
    return this.apiKey ? { "x-cg-demo-api-key": this.apiKey } : {};
  }

  async fetchHeadlines(): Promise<NewsHeadline[]> {
    const [globalRes, trendingRes] = await Promise.all([fetch("https://api.coingecko.com/api/v3/global", { headers: this.headers() }), fetch("https://api.coingecko.com/api/v3/search/trending", { headers: this.headers() })]);

    if (!globalRes.ok) throw new Error(`CoinGecko global fetch failed: ${globalRes.status} ${globalRes.statusText}`);
    if (!trendingRes.ok) throw new Error(`CoinGecko trending fetch failed: ${trendingRes.status} ${trendingRes.statusText}`);

    const global = (await globalRes.json()) as { data: { market_cap_percentage: { btc: number }; market_cap_change_percentage_24h_usd: number } };
    const trending = (await trendingRes.json()) as { coins: Array<{ item: { symbol: string } }> };

    const btcDominance = global.data.market_cap_percentage.btc.toFixed(1);
    const marketCapChange = global.data.market_cap_change_percentage_24h_usd.toFixed(2);
    const trendingSymbols = trending.coins
      .slice(0, 5)
      .map((c) => c.item.symbol.toUpperCase())
      .join(", ");

    return [
      {
        title: `Crypto market snapshot: BTC dominance ${btcDominance}%, total market cap 24h change ${marketCapChange}%, trending: ${trendingSymbols || "none"}`,
        source: "coingecko",
        publishedAt: new Date().toISOString(),
        url: "https://www.coingecko.com/",
      },
    ];
  }
}
