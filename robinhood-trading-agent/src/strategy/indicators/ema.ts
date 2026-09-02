import { sma } from "./sma.js";

/**
 * Exponential moving average, seeded with the SMA of the first `period`
 * values (the standard convention — avoids an arbitrary seed skewing early
 * values). Returns null for indices before the seed point.
 */
export function ema(values: number[], period: number): (number | null)[] {
  if (period <= 0) throw new Error("period must be positive");
  const out: (number | null)[] = new Array(values.length).fill(null);
  const seed = sma(values, period);
  const k = 2 / (period + 1);
  let prev: number | null = null;
  for (let i = 0; i < values.length; i++) {
    if (seed[i] !== null && prev === null) {
      prev = seed[i];
      out[i] = prev;
    } else if (prev !== null) {
      prev = values[i] * k + prev * (1 - k);
      out[i] = prev;
    }
  }
  return out;
}
