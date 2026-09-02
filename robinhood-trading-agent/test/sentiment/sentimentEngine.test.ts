import { describe, it, expect, vi, afterEach } from "vitest";
import { safelyFetch } from "../../src/sentiment/sentimentEngine.js";

describe("safelyFetch", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("never lets a caught error's message (which can embed the provider's API key via the request URL) reach the returned headline", async () => {
    // Simulates the exact leak vector: a Node/undici fetch-level network
    // error whose message includes the full request URL, secret query
    // param and all.
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const leakyError = new Error("fetch failed: request to https://finnhub.io/api/v1/news?token=SUPER_SECRET_KEY_123 failed, reason: connect ETIMEDOUT");

    const result = await safelyFetch("finnhub", () => Promise.reject(leakyError));

    expect(result).toHaveLength(1);
    expect(result[0].title).not.toContain("SUPER_SECRET_KEY_123");
    expect(result[0].title).not.toContain("token=");
    expect(result[0].title).not.toContain("https://");
    expect(result[0].title).toBe("(finnhub unavailable)");

    // The real error is still available server-side for debugging, just not user/LLM-facing.
    expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining("finnhub"), leakyError);
  });

  it("passes through headlines on success", async () => {
    const headlines = [{ title: "Fed holds rates steady", source: "wire", publishedAt: new Date().toISOString(), url: "https://example.com" }];
    const result = await safelyFetch("finnhub", () => Promise.resolve(headlines));
    expect(result).toEqual(headlines);
  });
});
