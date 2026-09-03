import { describe, it, expect, vi, afterEach } from "vitest";
import { safelyFetch, redactSecrets } from "../../src/sentiment/sentimentEngine.js";

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

    // The real error detail is still logged server-side for debugging
    // (status/message/stack), just with the secret redacted out of it —
    // it must never be the raw Error object or an un-redacted string.
    expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
    const [firstArg, secondArg] = consoleErrorSpy.mock.calls[0];
    expect(firstArg).toContain("finnhub");
    expect(typeof secondArg).toBe("string");
    expect(secondArg).toContain("connect ETIMEDOUT");
    expect(secondArg).not.toContain("SUPER_SECRET_KEY_123");
    expect(secondArg).toContain("[REDACTED]");
  });

  it("passes through headlines on success", async () => {
    const headlines = [{ title: "Fed holds rates steady", source: "wire", publishedAt: new Date().toISOString(), url: "https://example.com" }];
    const result = await safelyFetch("finnhub", () => Promise.resolve(headlines));
    expect(result).toEqual(headlines);
  });
});

describe("redactSecrets", () => {
  it("redacts a token= query param", () => {
    expect(redactSecrets("https://finnhub.io/api/v1/news?token=SECRET123")).toBe("https://finnhub.io/api/v1/news?token=[REDACTED]");
  });

  it("redacts an apiKey= query param", () => {
    expect(redactSecrets("https://newsapi.org/v2/top-headlines?apiKey=SECRET456")).toBe("https://newsapi.org/v2/top-headlines?apiKey=[REDACTED]");
  });

  it("redacts within a longer message, leaving surrounding text intact", () => {
    const input = "fetch failed: request to https://finnhub.io/news?token=ABC&category=general failed";
    const result = redactSecrets(input);
    expect(result).not.toContain("ABC");
    expect(result).toContain("fetch failed: request to https://finnhub.io/news?token=[REDACTED]&category=general failed");
  });

  it("leaves text with no secret-like query params unchanged", () => {
    expect(redactSecrets("plain error with no secrets")).toBe("plain error with no secrets");
  });
});
