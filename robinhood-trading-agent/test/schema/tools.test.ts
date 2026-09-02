import { describe, it, expect } from "vitest";
import { computeDecisionInputSchema, recordOutcomeInputSchema } from "../../src/schema/tools.js";

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

describe("recordOutcomeInputSchema's closedAt", () => {
  const base = { symbol: "AAPL", assetClass: "equity" as const, action: "BUY" as const, decisionScore: 0.5, contributingSignals: [], realizedReturnPct: 0.01, isDayTrade: false, currentEquity: 10_000 };

  it("accepts a valid ISO datetime", () => {
    expect(recordOutcomeInputSchema.safeParse({ ...base, closedAt: "2026-01-15T23:00:00.000Z" }).success).toBe(true);
  });

  it("accepts being omitted entirely", () => {
    expect(recordOutcomeInputSchema.safeParse(base).success).toBe(true);
  });

  it("rejects a non-ISO-datetime string instead of letting it crash record_outcome downstream", () => {
    expect(recordOutcomeInputSchema.safeParse({ ...base, closedAt: "not-a-date" }).success).toBe(false);
  });
});
