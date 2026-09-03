import { describe, it, expect } from "vitest";
import { redactSecrets } from "../../src/util/redact.js";

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
