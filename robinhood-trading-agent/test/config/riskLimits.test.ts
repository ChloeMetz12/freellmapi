import { describe, it, expect, afterEach } from "vitest";
import { RISK_LIMITS, applyEnvRiskOverrides } from "../../src/config/riskLimits.js";

describe("applyEnvRiskOverrides", () => {
  const originalDailyLoss = RISK_LIMITS.dailyLossHaltFraction;
  const originalMargin = RISK_LIMITS.marginUtilizationCap;
  const originalPdtThreshold = RISK_LIMITS.pdtEquityThresholdUsd;

  afterEach(() => {
    // RISK_LIMITS is a shared mutable singleton by design (see its
    // docstring) — restore it so this test doesn't leak state into others.
    applyEnvRiskOverrides({ DAILY_LOSS_HALT_PCT: originalDailyLoss, MARGIN_UTILIZATION_CAP: originalMargin, PDT_EQUITY_THRESHOLD_USD: originalPdtThreshold });
  });

  it("actually changes RISK_LIMITS' fields that .env.example documents as configurable", () => {
    applyEnvRiskOverrides({ DAILY_LOSS_HALT_PCT: 0.05, MARGIN_UTILIZATION_CAP: 0.5, PDT_EQUITY_THRESHOLD_USD: 30_000 });

    expect(RISK_LIMITS.dailyLossHaltFraction).toBe(0.05);
    expect(RISK_LIMITS.marginUtilizationCap).toBe(0.5);
    expect(RISK_LIMITS.pdtEquityThresholdUsd).toBe(30_000);
  });

  it("leaves non-.env-configurable fields (e.g. learning bounds) untouched", () => {
    const before = { ...RISK_LIMITS.learning };
    applyEnvRiskOverrides({ DAILY_LOSS_HALT_PCT: 0.2, MARGIN_UTILIZATION_CAP: 0.9, PDT_EQUITY_THRESHOLD_USD: 10_000 });
    expect(RISK_LIMITS.learning).toEqual(before);
  });
});
