import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SentimentCache } from "../../src/sentiment/sentimentCache.js";
import type { SentimentResult } from "../../src/sentiment/types.js";

let dir: string | undefined;

afterEach(() => {
  if (dir) rmSync(dir, { recursive: true, force: true });
  dir = undefined;
});

const VALID_RESULT: SentimentResult = { score: 0.3, confidence: 0.6, rationale: "test", scratchpad: "test reasoning", degraded: false };

describe("SentimentCache", () => {
  it("returns null when nothing has been cached yet", () => {
    dir = mkdtempSync(join(tmpdir(), "sentiment-cache-"));
    expect(new SentimentCache(dir).get()).toBeNull();
  });

  it("round-trips a valid cached result", () => {
    dir = mkdtempSync(join(tmpdir(), "sentiment-cache-"));
    const cache = new SentimentCache(dir);
    cache.set(VALID_RESULT);
    expect(new SentimentCache(dir).get()?.result).toEqual(VALID_RESULT);
  });

  it("degrades to null on corrupt JSON rather than throwing", () => {
    dir = mkdtempSync(join(tmpdir(), "sentiment-cache-"));
    writeFileSync(join(dir, "sentiment-cache.json"), "{not valid json");
    expect(new SentimentCache(dir).get()).toBeNull();
  });

  it("degrades to null when score is the wrong type instead of handing a bad value to computeSignal", () => {
    dir = mkdtempSync(join(tmpdir(), "sentiment-cache-"));
    writeFileSync(join(dir, "sentiment-cache.json"), JSON.stringify({ result: { ...VALID_RESULT, score: "not-a-number" }, computedAt: new Date().toISOString() }));
    expect(new SentimentCache(dir).get()).toBeNull();
  });

  it("degrades to null when a required field is missing", () => {
    dir = mkdtempSync(join(tmpdir(), "sentiment-cache-"));
    const { rationale: _rationale, ...incomplete } = VALID_RESULT;
    writeFileSync(join(dir, "sentiment-cache.json"), JSON.stringify({ result: incomplete, computedAt: new Date().toISOString() }));
    expect(new SentimentCache(dir).get()).toBeNull();
  });
});
