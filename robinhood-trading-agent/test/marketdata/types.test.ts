import { describe, it, expect } from "vitest";
import { assertSortedAscending } from "../../src/marketdata/types.js";
import type { OhlcvBar } from "../../src/marketdata/types.js";

function bar(timestamp: string): OhlcvBar {
  return { timestamp, open: 100, high: 101, low: 99, close: 100, volume: 1_000_000 };
}

describe("assertSortedAscending", () => {
  it("does not throw for properly ordered bars", () => {
    expect(() => assertSortedAscending([bar("2026-01-01T00:00:00.000Z"), bar("2026-01-01T00:05:00.000Z")])).not.toThrow();
  });

  it("throws for newest-first (reversed) bars", () => {
    expect(() => assertSortedAscending([bar("2026-01-01T00:05:00.000Z"), bar("2026-01-01T00:00:00.000Z")])).toThrow(/sorted oldest-first/);
  });

  it("throws for an unparseable timestamp instead of letting it silently defeat the ordering check", () => {
    // NaN < NaN and NaN > NaN are both false, so an invalid timestamp
    // would otherwise slip through the ordering comparison undetected.
    expect(() => assertSortedAscending([bar("2026-01-01T00:00:00.000Z"), bar("not-a-real-timestamp")])).toThrow(/unparseable timestamp/);
  });
});
