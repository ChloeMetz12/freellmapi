import { describe, it, expect } from "vitest";
import { computePositionSize } from "../../src/execution/sizing.js";
import { RISK_LIMITS } from "../../src/config/riskLimits.js";
import type { OhlcvBar } from "../../src/marketdata/types.js";

function constantRangeBars(count: number): OhlcvBar[] {
  return Array.from({ length: count }, (_, i) => ({
    timestamp: new Date(2026, 0, 1, 0, i).toISOString(),
    open: 100,
    high: 101,
    low: 99,
    close: 100,
    volume: 1_000_000,
  }));
}

describe("computePositionSize", () => {
  it("includes capped margin headroom in buying power when margin is enabled", () => {
    const result = computePositionSize({ cash: 1_000, maxMarginBuyingPower: 2_000, marginEnabled: true, confidence: 1, bars: constantRangeBars(20) });
    const expectedHeadroom = 2_000 * RISK_LIMITS.marginUtilizationCap;
    expect(result.marginHeadroomUsd).toBeCloseTo(expectedHeadroom, 6);
    expect(result.buyingPowerUsd).toBeCloseTo(1_000 + expectedHeadroom, 6);
  });

  it("excludes margin buying power entirely when margin is disabled", () => {
    const result = computePositionSize({ cash: 1_000, maxMarginBuyingPower: 2_000, marginEnabled: false, confidence: 1, bars: constantRangeBars(20) });
    expect(result.marginHeadroomUsd).toBe(0);
    expect(result.buyingPowerUsd).toBe(1_000);
  });

  it("scales position size linearly with confidence", () => {
    const full = computePositionSize({ cash: 1_000, maxMarginBuyingPower: 0, marginEnabled: false, confidence: 1, bars: constantRangeBars(20) });
    const half = computePositionSize({ cash: 1_000, maxMarginBuyingPower: 0, marginEnabled: false, confidence: 0.5, bars: constantRangeBars(20) });
    expect(half.positionSizeUsd).toBeCloseTo(full.positionSizeUsd / 2, 6);
  });

  it("uses a volatility scalar of 1.0 (uncapped) when current volatility equals the historical baseline", () => {
    const result = computePositionSize({ cash: 1_000, maxMarginBuyingPower: 0, marginEnabled: false, confidence: 1, bars: constantRangeBars(20) });
    expect(result.volatilityScalar).toBeCloseTo(1, 6);
    expect(result.positionSizeUsd).toBeCloseTo(1_000, 6);
  });

  it("sizes down conservatively (to the volatility scalar floor) when there isn't enough history to judge volatility", () => {
    const result = computePositionSize({ cash: 1_000, maxMarginBuyingPower: 0, marginEnabled: false, confidence: 1, bars: constantRangeBars(5) });
    expect(result.volatilityScalar).toBeCloseTo(RISK_LIMITS.volatilityScalarMin, 6);
  });

  it("never sizes a position larger than total buying power even at full confidence and calm volatility", () => {
    const result = computePositionSize({ cash: 1_000, maxMarginBuyingPower: 2_000, marginEnabled: true, confidence: 1, bars: constantRangeBars(20) });
    expect(result.positionSizeUsd).toBeLessThanOrEqual(result.buyingPowerUsd + 1e-9);
  });
});
