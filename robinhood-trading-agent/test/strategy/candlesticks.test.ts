import { describe, it, expect } from "vitest";
import { detectPatterns } from "../../src/strategy/candlesticks/patterns.js";
import type { OhlcvBar } from "../../src/marketdata/types.js";

function bar(open: number, high: number, low: number, close: number, volume = 1_000_000): OhlcvBar {
  return { timestamp: "2026-01-01T00:00:00.000Z", open, high, low, close, volume };
}

describe("detectPatterns", () => {
  it("detects a doji (tiny body relative to range)", () => {
    const matches = detectPatterns([bar(100, 102, 98, 100.05)]);
    expect(matches.some((m) => m.name === "doji")).toBe(true);
  });

  it("classifies a hammer-shaped candle as bullish 'hammer' after a downtrend", () => {
    const matches = detectPatterns([bar(100, 101.3, 95, 101)], "down");
    const hammer = matches.find((m) => m.name === "hammer");
    expect(hammer).toBeDefined();
    expect(hammer?.direction).toBe("bullish");
  });

  it("classifies the identical shape as bearish 'hanging-man' after an uptrend", () => {
    const matches = detectPatterns([bar(100, 101.3, 95, 101)], "up");
    const hangingMan = matches.find((m) => m.name === "hanging-man");
    expect(hangingMan).toBeDefined();
    expect(hangingMan?.direction).toBe("bearish");
  });

  it("classifies a shooting-star shape as bearish after an uptrend", () => {
    const matches = detectPatterns([bar(100, 105, 98.7, 99)], "up");
    const shootingStar = matches.find((m) => m.name === "shooting-star");
    expect(shootingStar).toBeDefined();
    expect(shootingStar?.direction).toBe("bearish");
  });

  it("detects a bullish engulfing pattern", () => {
    const prev = bar(100, 100.5, 97.5, 98);
    const curr = bar(97.5, 101.5, 97, 101);
    const matches = detectPatterns([prev, curr]);
    const engulfing = matches.find((m) => m.name === "bullish-engulfing");
    expect(engulfing).toBeDefined();
    expect(engulfing?.direction).toBe("bullish");
  });

  it("detects a bearish engulfing pattern", () => {
    const prev = bar(98, 101, 97.5, 100);
    const curr = bar(100.5, 101, 96, 97);
    const matches = detectPatterns([prev, curr]);
    const engulfing = matches.find((m) => m.name === "bearish-engulfing");
    expect(engulfing).toBeDefined();
    expect(engulfing?.direction).toBe("bearish");
  });

  it("detects a morning star (3-bar bullish reversal)", () => {
    const first = bar(100, 101, 89, 90);
    const middle = bar(88, 89.5, 86, 87);
    const last = bar(87.5, 97.5, 87, 97);
    const matches = detectPatterns([first, middle, last]);
    const morningStar = matches.find((m) => m.name === "morning-star");
    expect(morningStar).toBeDefined();
    expect(morningStar?.direction).toBe("bullish");
  });

  it("detects an evening star (3-bar bearish reversal)", () => {
    const first = bar(90, 101, 89, 100);
    const middle = bar(102, 103.5, 100.5, 101);
    const last = bar(100.5, 101, 90.5, 91);
    const matches = detectPatterns([first, middle, last]);
    const eveningStar = matches.find((m) => m.name === "evening-star");
    expect(eveningStar).toBeDefined();
    expect(eveningStar?.direction).toBe("bearish");
  });

  it("detects three white soldiers", () => {
    const bars = [bar(100, 103.5, 99.5, 103), bar(101, 105.4, 100.5, 105), bar(102, 107.3, 101.5, 107)];
    const matches = detectPatterns(bars);
    const soldiers = matches.find((m) => m.name === "three-white-soldiers");
    expect(soldiers).toBeDefined();
    expect(soldiers?.direction).toBe("bullish");
  });

  it("detects three black crows", () => {
    const bars = [bar(107, 107.5, 103.5, 104), bar(105, 105.5, 100.6, 101), bar(102, 102.5, 97.7, 98)];
    const matches = detectPatterns(bars);
    const crows = matches.find((m) => m.name === "three-black-crows");
    expect(crows).toBeDefined();
    expect(crows?.direction).toBe("bearish");
  });

  it("returns no matches for a plain unremarkable candle", () => {
    const matches = detectPatterns([bar(100, 103, 97, 101.5)]);
    expect(matches.find((m) => m.name === "doji")).toBeUndefined();
    expect(matches.find((m) => m.name === "hammer")).toBeUndefined();
  });
});
