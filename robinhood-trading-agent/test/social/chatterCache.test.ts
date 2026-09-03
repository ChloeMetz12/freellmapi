import { describe, it, expect, afterEach, vi } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ChatterCache } from "../../src/social/chatterCache.js";
import type { SymbolChatterResult } from "../../src/social/types.js";

let dir: string | undefined;

afterEach(() => {
  if (dir) rmSync(dir, { recursive: true, force: true });
  dir = undefined;
  vi.restoreAllMocks();
});

const RESULT: SymbolChatterResult = { symbol: "AAPL", score: 0.4, confidence: 0.6, rationale: "test", scratchpad: "test", messageCount: 5, degraded: false };

describe("ChatterCache", () => {
  it("returns null when nothing is cached for the symbol yet", () => {
    dir = mkdtempSync(join(tmpdir(), "chatter-cache-"));
    expect(new ChatterCache(dir).get("AAPL")).toBeNull();
  });

  it("round-trips a fresh cached result", () => {
    dir = mkdtempSync(join(tmpdir(), "chatter-cache-"));
    const cache = new ChatterCache(dir);
    cache.set(RESULT);
    expect(cache.get("AAPL")).toEqual(RESULT);
  });

  it("keeps separate symbols in separate cache entries", () => {
    dir = mkdtempSync(join(tmpdir(), "chatter-cache-"));
    const cache = new ChatterCache(dir);
    cache.set(RESULT);
    cache.set({ ...RESULT, symbol: "TSLA", score: -0.3 });

    expect(cache.get("AAPL")?.score).toBe(0.4);
    expect(cache.get("TSLA")?.score).toBe(-0.3);
  });

  it("expires an entry once its TTL has passed", () => {
    dir = mkdtempSync(join(tmpdir(), "chatter-cache-"));
    const shortTtlCache = new ChatterCache(dir, 1000);
    shortTtlCache.set(RESULT);
    expect(shortTtlCache.get("AAPL")).not.toBeNull();

    vi.useFakeTimers();
    vi.advanceTimersByTime(2000);
    expect(shortTtlCache.get("AAPL")).toBeNull();
    vi.useRealTimers();
  });

  it("degrades to null (cache miss) on corrupt JSON rather than throwing", () => {
    dir = mkdtempSync(join(tmpdir(), "chatter-cache-"));
    const cache = new ChatterCache(dir);
    writeFileSync(join(dir, "chatter-cache", "AAPL.json"), "{not valid json");
    expect(cache.get("AAPL")).toBeNull();
  });

  it("sanitizes a symbol with unexpected characters into a safe filename", () => {
    dir = mkdtempSync(join(tmpdir(), "chatter-cache-"));
    const cache = new ChatterCache(dir);
    expect(() => cache.set({ ...RESULT, symbol: "../../etc/passwd" })).not.toThrow();
    expect(cache.get("../../etc/passwd")).not.toBeNull();
  });
});
