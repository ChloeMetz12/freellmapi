import { describe, it, expect, vi, afterEach } from "vitest";
import { computeSymbolChatter } from "../../src/social/chatterEngine.js";

const BASE_ENV = { LLM_GATEWAY_URL: "http://localhost:3000/v1", SENTIMENT_MODEL: "gpt-4o-mini" };

describe("computeSymbolChatter", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    // Restored here (not just at the end of the fake-timer test below) so
    // a failed assertion or thrown error in that test can't leave the
    // worker on fake timers and contaminate later tests.
    vi.useRealTimers();
  });

  it("degrades to neutral when no chatter is found (StockTwits returns nothing, no X token configured)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ messages: [] }), { status: 200 })),
    );

    const result = await computeSymbolChatter("AAPL", { env: BASE_ENV });
    expect(result.degraded).toBe(true);
    expect(result.score).toBe(0);
    expect(result.symbol).toBe("AAPL");
  });

  it("degrades to neutral (not a thrown error) when the StockTwits fetch itself fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("network error");
      }),
    );
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await computeSymbolChatter("AAPL", { env: BASE_ENV });
    expect(result.degraded).toBe(true);
    expect(consoleErrorSpy).toHaveBeenCalled();
  });

  it("degrades to neutral when the LLM call fails, without throwing", async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (String(url).includes("stocktwits")) {
          return new Response(JSON.stringify({ messages: [{ body: "AAPL to the moon", created_at: new Date().toISOString(), id: 1 }] }), { status: 200 });
        }
        // The LLM gateway call itself fails every time (llmClient retries
        // a 500 a few times before giving up — fake timers skip past that).
        return new Response("server error", { status: 500 });
      }),
    );

    const promise = computeSymbolChatter("AAPL", { env: BASE_ENV });
    await vi.runAllTimersAsync();
    const result = await promise;
    expect(result.degraded).toBe(true);
  });
});
