import { describe, it, expect, vi, afterEach } from "vitest";
import { ShadowBrokerWorldNews } from "../../src/sentiment/providers/shadowBrokerWorldNews.js";

describe("ShadowBrokerWorldNews", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("maps /ai/news/summary into a snapshot headline plus risk-tagged stories", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        ok: true,
        article_count: 48,
        breaking_count: 2,
        avg_risk_score: 3.02,
        summary: "48 articles tracked. 2 BREAKING. Average threat score: 3.0/10.",
        threat_distribution: { CRITICAL: 0, HIGH: 4, LOW: 19 },
        top_stories: [
          {
            title: "U.S. military says it destroyed 5 Iranian oil tankers",
            source: "NPR",
            risk_score: 7,
            link: "https://example.com/a",
            published: "Wed, 09 Sep 2026 01:20:45 -0400",
          },
          {
            title: "Fed holds rates",
            source: "Wire",
            risk_score: 2,
            link: "https://example.com/b",
            published: "2026-09-09T12:00:00.000Z",
          },
        ],
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const provider = new ShadowBrokerWorldNews("http://127.0.0.1:8000/");
    const headlines = await provider.fetchHeadlines();

    expect(fetchMock).toHaveBeenCalledWith("http://127.0.0.1:8000/ai/news/summary");
    expect(headlines[0].source).toBe("shadowbroker");
    expect(headlines[0].title).toContain("Shadow Broker OSINT snapshot");
    expect(headlines[0].title).toContain("HIGH:4");
    expect(headlines).toHaveLength(3);
    expect(headlines[1].title).toBe("U.S. military says it destroyed 5 Iranian oil tankers [risk 7/10]");
    expect(headlines[1].source).toBe("NPR");
    expect(headlines[1].url).toBe("https://example.com/a");
    expect(headlines[1].publishedAt).toMatch(/^2026-09-09T/);
    expect(headlines[2].title).toContain("[risk 2/10]");
  });

  it("throws when the HTTP response is not ok", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 503,
        statusText: "Service Unavailable",
      }),
    );

    await expect(new ShadowBrokerWorldNews("http://127.0.0.1:8000").fetchHeadlines()).rejects.toThrow(/503/);
  });
});
