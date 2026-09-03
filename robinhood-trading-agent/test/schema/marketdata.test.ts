import { describe, it, expect } from "vitest";
import { ohlcvBarSchema } from "../../src/schema/marketdata.js";

const validBar = { timestamp: "2026-01-01T00:00:00.000Z", open: 100, high: 101, low: 99, close: 100, volume: 1_000_000 };

describe("ohlcvBarSchema", () => {
  it("accepts a valid bar", () => {
    expect(ohlcvBarSchema.safeParse(validBar).success).toBe(true);
  });

  it("rejects a non-ISO-datetime timestamp instead of letting it reach assertSortedAscending as a NaN date", () => {
    expect(ohlcvBarSchema.safeParse({ ...validBar, timestamp: "not-a-date" }).success).toBe(false);
  });

  it("rejects a non-finite numeric field", () => {
    // JSON itself can't encode NaN/Infinity, but a caller could still try
    // to smuggle one through a loosely-typed client — .finite() rejects it
    // at the boundary rather than relying on that being impossible.
    expect(ohlcvBarSchema.safeParse({ ...validBar, close: Infinity }).success).toBe(false);
  });
});
