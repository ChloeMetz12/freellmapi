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

    const decision = computeSignal(barsFromCloses(closes), null, DEFAULT_SIGNAL_WEIGHTS);
    const rsiSignal = decision.contributingSignals.find((s) => s.key === "momentum_rsi");
    expect(rsiSignal?.vote).toBe(0);
  });

  it("votes bearish once RSI crosses the overbought threshold", () => {
    const closes = Array.from({ length: 30 }, (_, i) => 100 + i * 2); // relentless uptrend -> RSI pinned near 100
    const decision = computeSignal(barsFromCloses(closes), null, DEFAULT_SIGNAL_WEIGHTS);
    const rsiSignal = decision.contributingSignals.find((s) => s.key === "momentum_rsi");
    expect(rsiSignal?.vote).toBeLessThan(0);
  });

  it("votes bullish once RSI crosses the oversold threshold", () => {
    const closes = Array.from({ length: 30 }, (_, i) => 200 - i * 2); // relentless downtrend -> RSI pinned near 0
    const decision = computeSignal(barsFromCloses(closes), null, DEFAULT_SIGNAL_WEIGHTS);
    const rsiSignal = decision.contributingSignals.find((s) => s.key === "momentum_rsi");
    expect(rsiSignal?.vote).toBeGreaterThan(0);
  });
});
