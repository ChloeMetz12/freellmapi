import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { callGatewayJson } from "../../src/sentiment/llmClient.js";

const BASE_ENV = { LLM_GATEWAY_URL: "http://localhost:3000/v1", SENTIMENT_MODEL: "gpt-4o-mini" };

function jsonResponse(content: unknown, status = 200): Response {
  return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(content) } }] }), { status });
}

describe("callGatewayJson", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("returns parsed JSON on a first-try success without retrying", async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ ok: true }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await callGatewayJson(BASE_ENV, "sys", "user");

    expect(result).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("retries a 429 and succeeds on the second attempt", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("rate limited", { status: 429 }))
      .mockResolvedValueOnce(jsonResponse({ ok: true }));
    vi.stubGlobal("fetch", fetchMock);

    const promise = callGatewayJson(BASE_ENV, "sys", "user");
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("honors a Retry-After header instead of the default backoff", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("rate limited", { status: 429, headers: { "retry-after": "2" } }))
      .mockResolvedValueOnce(jsonResponse({ ok: true }));
    vi.stubGlobal("fetch", fetchMock);
    const sleepSpy = vi.spyOn(global, "setTimeout");

    const promise = callGatewayJson(BASE_ENV, "sys", "user");
    await vi.runAllTimersAsync();
    await promise;

    // Retry-After: 2 -> 2000ms floor, plus up to 50% jitter — well above the
    // 300ms default first-backoff, confirming the header was actually read.
    expect(sleepSpy.mock.calls[0][1]).toBeGreaterThanOrEqual(2000);
  });

  it("caps the jittered Retry-After delay at 5s, not just the pre-jitter value", async () => {
    // A naive `Math.min(retryAfterMs, cap)` applied before adding jitter
    // lets the actual sleep run up to 1.5x past the cap (up to 7.5s here) —
    // this asserts the cap holds on the final, post-jitter delay.
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("rate limited", { status: 429, headers: { "retry-after": "10" } }))
      .mockResolvedValueOnce(jsonResponse({ ok: true }));
    vi.stubGlobal("fetch", fetchMock);
    const sleepSpy = vi.spyOn(global, "setTimeout");

    const promise = callGatewayJson(BASE_ENV, "sys", "user");
    await vi.runAllTimersAsync();
    await promise;

    expect(sleepSpy.mock.calls[0][1]).toBeLessThanOrEqual(5000);
  });

  it("drains a failed response's body before retrying, so the connection can be reused", async () => {
    const cancelSpy = vi.fn(async () => undefined);
    const failingResponse = new Response("rate limited", { status: 429 });
    vi.spyOn(failingResponse, "body", "get").mockReturnValue({ cancel: cancelSpy } as unknown as ReadableStream);
    const fetchMock = vi.fn().mockResolvedValueOnce(failingResponse).mockResolvedValueOnce(jsonResponse({ ok: true }));
    vi.stubGlobal("fetch", fetchMock);

    const promise = callGatewayJson(BASE_ENV, "sys", "user");
    await vi.runAllTimersAsync();
    await promise;

    expect(cancelSpy).toHaveBeenCalledTimes(1);
  });

  it("retries transient 5xx errors the same as 429", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("server error", { status: 503 }))
      .mockResolvedValueOnce(jsonResponse({ ok: true }));
    vi.stubGlobal("fetch", fetchMock);

    const promise = callGatewayJson(BASE_ENV, "sys", "user");
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does not retry a non-retryable 4xx like 400", async () => {
    const fetchMock = vi.fn(async () => new Response("bad request", { status: 400, statusText: "Bad Request" }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(callGatewayJson(BASE_ENV, "sys", "user")).rejects.toThrow(/400/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("gives up and throws after exhausting retries on persistent 429s", async () => {
    const fetchMock = vi.fn(async () => new Response("rate limited", { status: 429 }));
    vi.stubGlobal("fetch", fetchMock);

    const promise = callGatewayJson(BASE_ENV, "sys", "user");
    const expectation = expect(promise).rejects.toThrow(/429/);
    await vi.runAllTimersAsync();
    await expectation;

    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});
