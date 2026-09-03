import { describe, it, expect } from "vitest";
import { applyLearningUpdate } from "../../src/learning/update.js";
import { DEFAULT_SIGNAL_WEIGHTS } from "../../src/strategy/types.js";
import { RISK_LIMITS } from "../../src/config/riskLimits.js";

describe("applyLearningUpdate", () => {
  it("increases a signal's weight when it agreed with a winning decision", () => {
    const { weights, adjustments } = applyLearningUpdate(DEFAULT_SIGNAL_WEIGHTS, [{ key: "trend", vote: 0.8 }], 1, 0.02);
    expect(weights.trend).toBeGreaterThan(DEFAULT_SIGNAL_WEIGHTS.trend);
    expect(adjustments).toHaveLength(1);
    expect(adjustments[0].delta).toBeGreaterThan(0);
  });

  it("decreases a signal's weight when it agreed with a losing decision", () => {
    const { weights } = applyLearningUpdate(DEFAULT_SIGNAL_WEIGHTS, [{ key: "trend", vote: 0.8 }], 1, -0.02);
    expect(weights.trend).toBeLessThan(DEFAULT_SIGNAL_WEIGHTS.trend);
  });

  it("increases a signal's weight when it correctly disagreed with a losing decision", () => {
    const { weights } = applyLearningUpdate(DEFAULT_SIGNAL_WEIGHTS, [{ key: "momentum_rsi", vote: -0.6 }], 1, -0.02);
    expect(weights.momentum_rsi).toBeGreaterThan(DEFAULT_SIGNAL_WEIGHTS.momentum_rsi);
  });

  it("decreases a signal's weight when it disagreed with a winning decision", () => {
    const { weights } = applyLearningUpdate(DEFAULT_SIGNAL_WEIGHTS, [{ key: "momentum_rsi", vote: -0.6 }], 1, 0.02);
    expect(weights.momentum_rsi).toBeLessThan(DEFAULT_SIGNAL_WEIGHTS.momentum_rsi);
  });

  it("does not adjust a signal that expressed no opinion (vote of 0)", () => {
    const { weights, adjustments } = applyLearningUpdate(DEFAULT_SIGNAL_WEIGHTS, [{ key: "sentiment", vote: 0 }], 1, 0.02);
    expect(weights.sentiment).toBe(DEFAULT_SIGNAL_WEIGHTS.sentiment);
    expect(adjustments).toHaveLength(0);
  });

  it("never pushes a weight below the configured minimum even after many losing trades", () => {
    let weights = DEFAULT_SIGNAL_WEIGHTS;
    for (let i = 0; i < 200; i++) {
      ({ weights } = applyLearningUpdate(weights, [{ key: "candlestick", vote: 0.9 }], 1, -0.1));
    }
    expect(weights.candlestick).toBeGreaterThanOrEqual(RISK_LIMITS.learning.minWeight);
    expect(weights.candlestick).toBeCloseTo(RISK_LIMITS.learning.minWeight, 5);
  });

  it("never pushes a weight above the configured maximum even after many winning trades", () => {
    let weights = DEFAULT_SIGNAL_WEIGHTS;
    for (let i = 0; i < 200; i++) {
      ({ weights } = applyLearningUpdate(weights, [{ key: "candlestick", vote: 0.9 }], 1, 0.1));
    }
    expect(weights.candlestick).toBeLessThanOrEqual(RISK_LIMITS.learning.maxWeight);
    expect(weights.candlestick).toBeCloseTo(RISK_LIMITS.learning.maxWeight, 5);
  });

  it("caps the per-trade step size regardless of how large the realized return was", () => {
    const { adjustments } = applyLearningUpdate(DEFAULT_SIGNAL_WEIGHTS, [{ key: "trend", vote: 1 }], 1, 5.0);
    expect(Math.abs(adjustments[0].delta)).toBeCloseTo(RISK_LIMITS.learning.stepSize, 10);
  });
});
