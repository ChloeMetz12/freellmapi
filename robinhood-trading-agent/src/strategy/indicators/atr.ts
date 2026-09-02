import type { OhlcvBar } from "../../marketdata/types.js";

/** Wilder's Average True Range. Returns null for indices before `period` true ranges are available. */
export function atr(bars: OhlcvBar[], period = 14): (number | null)[] {
  if (period <= 0) throw new Error("period must be positive");
  const out: (number | null)[] = new Array(bars.length).fill(null);
  if (bars.length <= period) return out;

  const trueRanges: number[] = [];
  for (let i = 1; i < bars.length; i++) {
    const { high, low } = bars[i];
    const prevClose = bars[i - 1].close;
    trueRanges.push(Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose)));
  }

  let avg = trueRanges.slice(0, period).reduce((a, b) => a + b, 0) / period;
  out[period] = avg;
  for (let i = period + 1; i < bars.length; i++) {
    const tr = trueRanges[i - 1];
    avg = (avg * (period - 1) + tr) / period;
    out[i] = avg;
  }
  return out;
}

/** Baseline ATR to compare "current" volatility against — the mean ATR over the lookback, excluding trailing nulls. */
export function baselineAtr(atrSeries: (number | null)[]): number | null {
  const valid = atrSeries.filter((v): v is number => v !== null);
  if (valid.length === 0) return null;
  return valid.reduce((a, b) => a + b, 0) / valid.length;
}
