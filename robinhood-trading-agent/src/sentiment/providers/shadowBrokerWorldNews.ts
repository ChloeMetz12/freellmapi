import type { NewsHeadline, NewsProvider } from "../types.js";

type ShadowBrokerTopStory = {
  title?: string;
  source?: string;
  risk_score?: number;
  sentiment?: number;
  link?: string;
  published?: string;
};

type ShadowBrokerNewsSummary = {
  ok?: boolean;
  article_count?: number;
  breaking_count?: number;
  avg_risk_score?: number;
  summary?: string;
  threat_distribution?: Record<string, number>;
  top_stories?: ShadowBrokerTopStory[];
};

/**
 * Local Shadow Broker / WORLDVIEW OSINT feed (`/ai/news/summary` on the
 * backend, typically http://127.0.0.1:8000 — not the Next.js UI on :3000).
 *
 * Returns a synthetic macro snapshot plus the highest-risk top stories so
 * `get_sentiment` can weigh fresh geopolitical context alongside Finnhub /
 * NewsAPI / X. No API key; degrades via `safelyFetch` when the stack is down.
 */
export class ShadowBrokerWorldNews implements NewsProvider {
  readonly name = "shadowbroker-world-news";

  constructor(
    private readonly baseUrl: string,
    private readonly maxStories = 12,
  ) {}

  async fetchHeadlines(): Promise<NewsHeadline[]> {
    const url = `${this.baseUrl.replace(/\/$/, "")}/ai/news/summary`;
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Shadow Broker news summary failed: ${response.status} ${response.statusText}`);
    }

    const body = (await response.json()) as ShadowBrokerNewsSummary;
    if (body.ok === false) {
      throw new Error("Shadow Broker news summary returned ok=false");
    }

    const now = new Date().toISOString();
    const headlines: NewsHeadline[] = [];

    const threatBits = body.threat_distribution
      ? Object.entries(body.threat_distribution)
          .filter(([, n]) => typeof n === "number" && n > 0)
          .map(([k, n]) => `${k}:${n}`)
          .join(" ")
      : "";
    const summaryText =
      typeof body.summary === "string" && body.summary.trim().length > 0
        ? body.summary.trim()
        : `Shadow Broker tracking ${body.article_count ?? "?"} articles` +
          (typeof body.avg_risk_score === "number" ? `, avg risk ${body.avg_risk_score.toFixed(1)}/10` : "") +
          (typeof body.breaking_count === "number" ? `, breaking ${body.breaking_count}` : "");

    headlines.push({
      title: `Shadow Broker OSINT snapshot: ${summaryText}${threatBits ? ` [${threatBits}]` : ""}`,
      source: "shadowbroker",
      publishedAt: now,
      url: this.baseUrl.replace(/\/$/, ""),
    });

    const stories = Array.isArray(body.top_stories) ? body.top_stories : [];
    for (const story of stories.slice(0, this.maxStories)) {
      const title = typeof story.title === "string" ? story.title.trim() : "";
      if (!title) continue;
      const risk =
        typeof story.risk_score === "number" && Number.isFinite(story.risk_score) ? ` [risk ${Math.round(story.risk_score)}/10]` : "";
      headlines.push({
        title: `${title}${risk}`,
        source: typeof story.source === "string" && story.source.trim() ? story.source.trim() : "shadowbroker",
        publishedAt: parsePublished(story.published) ?? now,
        url: typeof story.link === "string" ? story.link : "",
      });
    }

    return headlines;
  }
}

function parsePublished(raw: string | undefined): string | undefined {
  if (!raw || typeof raw !== "string") return undefined;
  const ms = Date.parse(raw);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : undefined;
}
