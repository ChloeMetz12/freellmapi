import { describe, it, expect } from "vitest";
import { canRecordDayTrade, recordDayTrade } from "../../src/safety/pdt.js";
import type { SafetyState } from "../../src/safety/state.js";

const emptyState: SafetyState = {
  manuallyHalted: false,
  autoHaltReason: null,
  dayStartEquity: null,
  dayStartDateIso: null,
  pdtTrades: [],
};

// A Wednesday, so the preceding 5 business days are unambiguous.
const NOW = new Date("2026-09-02T15:00:00.000Z");

describe("PDT (pattern day trader) guard", () => {
  it("never restricts crypto, regardless of equity", () => {
    expect(canRecordDayTrade(emptyState, "crypto", 1_000, NOW).allowed).toBe(true);
  });

  it("never restricts equities once account equity is at/above the $25k threshold", () => {
    expect(canRecordDayTrade(emptyState, "equity", 25_000, NOW).allowed).toBe(true);
  });

  it("allows up to 3 day trades in the rolling window for a sub-$25k equities account", () => {
    let state = emptyState;
    for (let i = 0; i < 3; i++) {
      expect(canRecordDayTrade(state, "equity", 10_000, NOW).allowed).toBe(true);
      state = recordDayTrade(state, "AAPL", NOW);
    }
    const result = canRecordDayTrade(state, "equity", 10_000, NOW);
    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/PDT limit reached/);
  });

  it("does not count trades outside the rolling business-day window", () => {
    const longAgo = new Date("2026-08-01T15:00:00.000Z");
    let state = emptyState;
    for (let i = 0; i < 3; i++) state = recordDayTrade(state, "AAPL", longAgo);
    expect(canRecordDayTrade(state, "equity", 10_000, NOW).allowed).toBe(true);
  });
});
