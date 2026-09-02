import { describe, it, expect } from "vitest";
import { computeDecisionInputSchema } from "../../src/schema/tools.js";

function bar(i: number) {
  return { timestamp: new Date(2026, 0, 1, 0, i).toISOString(), open: 100, high: 101, low: 99, close: 100, volume: 1_000_000 };
}

describe("computeDecisionInputSchema", () => {
  it("rejects fewer bars than the strategy's real minimum for its indicators to activate", () => {
    const result = computeDecisionInputSchema.safeParse({ symbol: "SPY", bars: Array.from({ length: 20 }, (_, i) => bar(i)) });
    expect(result.success).toBe(false);
  });

  it("accepts exactly the enforced minimum", () => {
    const result = computeDecisionInputSchema.safeParse({ symbol: "SPY", bars: Array.from({ length: 21 }, (_, i) => bar(i)) });
    expect(result.success).toBe(true);
  });
});
