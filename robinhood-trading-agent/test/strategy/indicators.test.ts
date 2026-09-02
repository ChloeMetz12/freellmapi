import { describe, it, expect } from "vitest";
import { sma, ema, rsi, macd, bollingerBands, atr, baselineAtr, relativeVolume } from "../../src/strategy/indicators/index.js";
import type { OhlcvBar } from "../../src/marketdata/types.js";

describe("sma", () => {
  it("computes a simple moving average, null before the window fills", () => {
    const result = sma([1, 2, 3, 4, 5], 3);
    expect(result).toEqual([null, null, 2, 3, 4]);
  });
});

describe("ema", () => {
  it("seeds with the SMA and applies the exponential multiplier thereafter", () => {
    const result = ema([1, 2, 3, 4, 5], 3);
    expect(result[0]).toBeNull();
    expect(result[1]).toBeNull();
    expect(result[2]).toBeCloseTo(2, 10);
    expect(result[3]).toBeCloseTo(3, 10);
    expect(result[4]).toBeCloseTo(4, 10);
  });
});

describe("rsi", () => {
  it("is null before enough price changes are available", () => {
    const closes = Array.from({ length: 14 }, (_, i) => i + 1);
    expect(rsi(closes, 14)[13]).toBeNull();
  });

  it("is 100 for a strictly increasing series (no losses at all)", () => {
    const closes = Array.from({ length: 16 }, (_, i) => i + 1);
    const result = rsi(closes, 14);
    expect(result[14]).toBe(100);
    expect(result[15]).toBe(100);
  });

  it("is 0 for a strictly decreasing series (no gains at all)", () => {
    const closes = Array.from({ length: 16 }, (_, i) => 100 - i);
    const result = rsi(closes, 14);
    expect(result[14]).toBe(0);
    expect(result[15]).toBe(0);
  });
});

describe("macd", () => {
  it("has a positive MACD line (fast EMA above slow EMA) on a sustained uptrend", () => {
    const closes = Array.from({ length: 60 }, (_, i) => 100 + i * 0.5);
    const { macdLine } = macd(closes);
    const last = macdLine[macdLine.length - 1];
    expect(last).not.toBeNull();
    expect(last as number).toBeGreaterThan(0);
  });

  it("has a negative MACD line (fast EMA below slow EMA) on a sustained downtrend", () => {
    const closes = Array.from({ length: 60 }, (_, i) => 100 - i * 0.5);
    const { macdLine } = macd(closes);
    const last = macdLine[macdLine.length - 1];
    expect(last).not.toBeNull();
    expect(last as number).toBeLessThan(0);
  });

  it("has a positive histogram (momentum accelerating) when an uptrend steepens", () => {
    // A constant-slope trend converges to a ~zero histogram (MACD line
    // flattens out and the signal line catches up) — the histogram only
    // moves off zero when the trend's slope itself changes.
    const closes = Array.from({ length: 60 }, (_, i) => 100 + i * 0.2 + Math.max(0, i - 40) * 0.8);
    const { histogram } = macd(closes);
    const last = histogram[histogram.length - 1];
    expect(last).not.toBeNull();
    expect(last as number).toBeGreaterThan(0);
  });
});

describe("bollingerBands", () => {
  it("collapses to a flat band (upper=middle=lower) for a constant series", () => {
    const closes = new Array(25).fill(100);
    const { upper, middle, lower } = bollingerBands(closes, 20, 2);
    expect(middle[24]).toBe(100);
    expect(upper[24]).toBe(100);
    expect(lower[24]).toBe(100);
  });
});

describe("atr", () => {
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

  it("converges to the constant true range", () => {
    const bars = constantRangeBars(16);
    const series = atr(bars, 14);
    expect(series[13]).toBeNull();
    expect(series[14]).toBeCloseTo(2, 10);
    expect(series[15]).toBeCloseTo(2, 10);
    expect(baselineAtr(series)).toBeCloseTo(2, 10);
  });
});

describe("relativeVolume", () => {
  it("computes the ratio of the latest bar's volume to the prior average", () => {
    const bars: OhlcvBar[] = Array.from({ length: 21 }, (_, i) => ({
      timestamp: new Date(2026, 0, 1, 0, i).toISOString(),
      open: 100,
      high: 101,
      low: 99,
      close: 100,
      volume: i === 20 ? 300 : 100,
    }));
    expect(relativeVolume(bars, 20)).toBeCloseTo(3, 10);
  });
});
