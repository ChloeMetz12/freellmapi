import { describe, it, expect } from "vitest";
import { evaluateSafety, halt, resume } from "../../src/safety/killSwitch.js";
import type { SafetyState } from "../../src/safety/state.js";
import { RISK_LIMITS } from "../../src/config/riskLimits.js";

const baseState: SafetyState = {
  manuallyHalted: false,
  autoHaltReason: null,
  dayStartEquity: null,
  dayStartDateIso: null,
  pdtTrades: [],
};

const DAY_ONE = new Date("2026-09-02T14:00:00.000Z");
const SAME_DAY_LATER = new Date("2026-09-02T18:00:00.000Z");

describe("evaluateSafety", () => {
  it("rebaselines day-start equity on the first check of a new day without halting", () => {
    const result = evaluateSafety(baseState, { currentEquity: 10_000, marginMaintenanceUtilization: null, now: DAY_ONE });
    expect(result.halted).toBe(false);
    expect(result.updatedState.dayStartEquity).toBe(10_000);
  });

  it("halts once the daily loss fraction meets the threshold", () => {
    const dayStarted = evaluateSafety(baseState, { currentEquity: 10_000, marginMaintenanceUtilization: null, now: DAY_ONE }).updatedState;
    const lossFraction = RISK_LIMITS.dailyLossHaltFraction;
    const droppedEquity = 10_000 * (1 - lossFraction);
    const result = evaluateSafety(dayStarted, { currentEquity: droppedEquity, marginMaintenanceUtilization: null, now: SAME_DAY_LATER });
    expect(result.halted).toBe(true);
    expect(result.reason).toMatch(/Daily equity loss/);
    expect(result.updatedState.autoHaltReason).not.toBeNull();
  });

  it("does not halt for a loss just under the threshold", () => {
    const dayStarted = evaluateSafety(baseState, { currentEquity: 10_000, marginMaintenanceUtilization: null, now: DAY_ONE }).updatedState;
    const result = evaluateSafety(dayStarted, { currentEquity: 10_000 * (1 - RISK_LIMITS.dailyLossHaltFraction + 0.01), marginMaintenanceUtilization: null, now: SAME_DAY_LATER });
    expect(result.halted).toBe(false);
  });

  it("halts immediately on margin-call risk regardless of daily P&L", () => {
    const dayStarted = evaluateSafety(baseState, { currentEquity: 10_000, marginMaintenanceUtilization: null, now: DAY_ONE }).updatedState;
    const result = evaluateSafety(dayStarted, { currentEquity: 10_500, marginMaintenanceUtilization: 0.95, now: SAME_DAY_LATER });
    expect(result.halted).toBe(true);
    expect(result.reason).toMatch(/Margin maintenance/);
  });

  it("stays halted on subsequent checks until an explicit resume", () => {
    const halted = halt(baseState, "manual test halt");
    const stillHalted = evaluateSafety(halted, { currentEquity: 10_000, marginMaintenanceUtilization: null, now: DAY_ONE });
    expect(stillHalted.halted).toBe(true);

    const resumed = resume(halted);
    const afterResume = evaluateSafety(resumed, { currentEquity: 10_000, marginMaintenanceUtilization: null, now: DAY_ONE });
    expect(afterResume.halted).toBe(false);
  });
});
