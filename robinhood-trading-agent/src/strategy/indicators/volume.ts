import type { OhlcvBar } from "../../marketdata/types.js";

/** Ratio of the latest bar's volume to the average volume of the preceding `period` bars. Null if not enough history. */
export function relativeVolume(bars: OhlcvBar[], period = 20): number | null {
  if (bars.length <= period) return null;
  const window = bars.slice(bars.length - period - 1, bars.length - 1);
  const avg = window.reduce((sum, b) => sum + b.volume, 0) / period;
  if (avg === 0) return null;
  return bars[bars.length - 1].volume / avg;
}
