import { ema } from "./ema.js";

export interface MacdResult {
  macdLine: (number | null)[];
  signalLine: (number | null)[];
  histogram: (number | null)[];
}

export function macd(closes: number[], fastPeriod = 12, slowPeriod = 26, signalPeriod = 9): MacdResult {
  const fastEma = ema(closes, fastPeriod);
  const slowEma = ema(closes, slowPeriod);
  const macdLine: (number | null)[] = closes.map((_, i) => {
    const f = fastEma[i];
    const s = slowEma[i];
    return f !== null && s !== null ? f - s : null;
  });

  // Signal line is the EMA of the MACD line, computed only over the
  // contiguous non-null tail (ema() seeds on the first `period` values it
  // sees, so leading nulls must be stripped first or the seed point shifts).
  const firstValid = macdLine.findIndex((v) => v !== null);
  const signalLine: (number | null)[] = new Array(closes.length).fill(null);
  if (firstValid !== -1) {
    const tail = macdLine.slice(firstValid) as number[];
    const tailSignal = ema(tail, signalPeriod);
    for (let i = 0; i < tailSignal.length; i++) {
      signalLine[firstValid + i] = tailSignal[i];
    }
  }

  const histogram: (number | null)[] = closes.map((_, i) => {
    const m = macdLine[i];
    const s = signalLine[i];
    return m !== null && s !== null ? m - s : null;
  });

  return { macdLine, signalLine, histogram };
}
