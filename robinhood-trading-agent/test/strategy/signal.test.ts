import { describe, it, expect } from "vitest";
import { computeSignal } from "../../src/strategy/signal.js";
import { rsi } from "../../src/strategy/indicators/rsi.js";
import { RISK_LIMITS } from "../../src/config/riskLimits.js";
import { DEFAULT_SIGNAL_WEIGHTS } from "../../src/strategy/types.js";
import type { OhlcvBar } from "../../src/marketdata/types.js";

function barsFromCloses(closes: number[]): OhlcvBar[] {
  return closes.map((close, i) => ({
    timestamp: new Date(2026, 0, 1, 0, i).toISOString(),
    open: close,
    high: close,
    low: close,
    close,
    volume: 1_000_000,
  }));
}

describe("computeSignal's RSI vote", () => {
  it("stays neutral (0) while RSI sits inside the configured overbought/oversold band", () => {
    // A mild, choppy uptrend: gains and losses close enough in size that
    // RSI(14) lands comfortably between rsiOversold and rsiOverbought
    // rather than pinned at an extreme.
    const closes: number[] = [100];
    for (let i = 0; i < 40; i++) {
      closes.push(closes[closes.length - 1] + (i % 3 === 0 ? -0.8 : 1));
    }

    const rsiSeries = rsi(closes, 14);
    const lastRsi = rsiSeries[rsiSeries.length - 1] as number;
    expect(lastRsi).toBeGreaterThan(RISK_LIMITS.rsiOversold);
    expect(lastRsi).toBeLessThan(RISK_LIMITS.rsiOverbought);

    const decision = computeSignal(barsFromCloses(closes), null, null, DEFAULT_SIGNAL_WEIGHTS);
    const rsiSignal = decision.contributingSignals.find((s) => s.key === "momentum_rsi");
    expect(rsiSignal?.vote).toBe(0);
  });

  it("votes bearish once RSI crosses the overbought threshold", () => {
    const closes = Array.from({ length: 30 }, (_, i) => 100 + i * 2); // relentless uptrend -> RSI pinned near 100
    const decision = computeSignal(barsFromCloses(closes), null, null, DEFAULT_SIGNAL_WEIGHTS);
    const rsiSignal = decision.contributingSignals.find((s) => s.key === "momentum_rsi");
    expect(rsiSignal?.vote).toBeLessThan(0);
  });

  it("votes bullish once RSI crosses the oversold threshold", () => {
    const closes = Array.from({ length: 30 }, (_, i) => 200 - i * 2); // relentless downtrend -> RSI pinned near 0
    const decision = computeSignal(barsFromCloses(closes), null, null, DEFAULT_SIGNAL_WEIGHTS);
    const rsiSignal = decision.contributingSignals.find((s) => s.key === "momentum_rsi");
    expect(rsiSignal?.vote).toBeGreaterThan(0);
  });
});

describe("computeSignal's social_chatter vote", () => {
  const closes = Array.from({ length: 30 }, (_, i) => 100 + Math.sin(i / 3));

  it("is absent when no chatter score is available", () => {
    const decision = computeSignal(barsFromCloses(closes), null, null, DEFAULT_SIGNAL_WEIGHTS);
    expect(decision.contributingSignals.find((s) => s.key === "social_chatter")).toBeUndefined();
  });

  it("votes with the given chatter score, clamped to [-1, 1]", () => {
    const decision = computeSignal(barsFromCloses(closes), null, 0.6, DEFAULT_SIGNAL_WEIGHTS);
    const chatterSignal = decision.contributingSignals.find((s) => s.key === "social_chatter");
    expect(chatterSignal?.vote).toBeCloseTo(0.6, 10);
  });

  it("clamps an out-of-range chatter score", () => {
    const decision = computeSignal(barsFromCloses(closes), null, 5, DEFAULT_SIGNAL_WEIGHTS);
    const chatterSignal = decision.contributingSignals.find((s) => s.key === "social_chatter");
    expect(chatterSignal?.vote).toBe(1);
  });

  it("uses its own default weight (0.5, lower than the other signals) unless learning/ has adjusted it", () => {
    const decision = computeSignal(barsFromCloses(closes), null, 0.6, DEFAULT_SIGNAL_WEIGHTS);
    const chatterSignal = decision.contributingSignals.find((s) => s.key === "social_chatter");
    expect(chatterSignal?.weight).toBe(DEFAULT_SIGNAL_WEIGHTS.social_chatter);
    expect(chatterSignal?.weight).toBeLessThan(DEFAULT_SIGNAL_WEIGHTS.trend);
  });
});
