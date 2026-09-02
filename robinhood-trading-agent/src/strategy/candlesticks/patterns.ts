import type { OhlcvBar } from "../../marketdata/types.js";
import type { PatternMatch, TrendContext } from "./types.js";

interface Anatomy {
  body: number;
  range: number;
  upperWick: number;
  lowerWick: number;
  isBullish: boolean;
  bodyTop: number;
  bodyBottom: number;
}

function anatomy(bar: OhlcvBar): Anatomy {
  const isBullish = bar.close >= bar.open;
  const bodyTop = Math.max(bar.open, bar.close);
  const bodyBottom = Math.min(bar.open, bar.close);
  return {
    body: bodyTop - bodyBottom,
    range: bar.high - bar.low,
    upperWick: bar.high - bodyTop,
    lowerWick: bodyBottom - bar.low,
    isBullish,
    bodyTop,
    bodyBottom,
  };
}

function detectDoji(bar: OhlcvBar): PatternMatch | null {
  const a = anatomy(bar);
  if (a.range === 0) return null;
  const bodyRatio = a.body / a.range;
  if (bodyRatio > 0.1) return null;
  // A doji is a signal of indecision, not directional on its own; report it
  // as whichever side had the (tiny) edge so it can carry a small vote.
  return { name: "doji", direction: bar.close >= bar.open ? "bullish" : "bearish", strength: 1 - bodyRatio / 0.1 };
}

function detectHammerShape(bar: OhlcvBar, trend: TrendContext): PatternMatch | null {
  const a = anatomy(bar);
  if (a.range === 0 || a.body === 0) return null;
  const smallBody = a.body / a.range <= 0.35;
  const longLowerWick = a.lowerWick >= 2 * a.body;
  const smallUpperWick = a.upperWick <= a.body * 0.5;
  if (!smallBody || !longLowerWick || !smallUpperWick) return null;

  const strength = Math.min(1, a.lowerWick / (2 * a.body + 1e-9) / 2);
  if (trend === "down") return { name: "hammer", direction: "bullish", strength };
  if (trend === "up") return { name: "hanging-man", direction: "bearish", strength };
  // No trend context: treat as a weak, direction-agnostic reversal hint.
  return { name: "hammer-shape", direction: bar.close >= bar.open ? "bullish" : "bearish", strength: strength * 0.5 };
}

function detectShootingStarShape(bar: OhlcvBar, trend: TrendContext): PatternMatch | null {
  const a = anatomy(bar);
  if (a.range === 0 || a.body === 0) return null;
  const smallBody = a.body / a.range <= 0.35;
  const longUpperWick = a.upperWick >= 2 * a.body;
  const smallLowerWick = a.lowerWick <= a.body * 0.5;
  if (!smallBody || !longUpperWick || !smallLowerWick) return null;

  const strength = Math.min(1, a.upperWick / (2 * a.body + 1e-9) / 2);
  if (trend === "up") return { name: "shooting-star", direction: "bearish", strength };
  if (trend === "down") return { name: "inverted-hammer", direction: "bullish", strength };
  return { name: "shooting-star-shape", direction: bar.close >= bar.open ? "bullish" : "bearish", strength: strength * 0.5 };
}

function detectEngulfing(prev: OhlcvBar, curr: OhlcvBar): PatternMatch | null {
  const p = anatomy(prev);
  const c = anatomy(curr);
  if (p.body === 0 || c.body === 0) return null;

  const bullishEngulfing = !p.isBullish && c.isBullish && curr.open <= prev.close && curr.close >= prev.open;
  const bearishEngulfing = p.isBullish && !c.isBullish && curr.open >= prev.close && curr.close <= prev.open;
  if (!bullishEngulfing && !bearishEngulfing) return null;

  const strength = Math.min(1, c.body / (p.body + 1e-9) - 1);
  if (strength <= 0) return null;
  return {
    name: bullishEngulfing ? "bullish-engulfing" : "bearish-engulfing",
    direction: bullishEngulfing ? "bullish" : "bearish",
    strength: Math.min(1, strength),
  };
}

function detectStar(first: OhlcvBar, middle: OhlcvBar, last: OhlcvBar): PatternMatch | null {
  const f = anatomy(first);
  const m = anatomy(middle);
  const l = anatomy(last);
  if (f.body === 0 || l.body === 0) return null;

  const middleIsSmall = m.body <= f.body * 0.3;
  if (!middleIsSmall) return null;

  const morning = !f.isBullish && l.isBullish && middle.high < first.close && last.close >= f.bodyTop - f.body * 0.5;
  const evening = f.isBullish && !l.isBullish && middle.low > first.close && last.close <= f.bodyBottom + f.body * 0.5;
  if (!morning && !evening) return null;

  const penetration = morning ? (last.close - f.bodyBottom) / f.body : (f.bodyTop - last.close) / f.body;
  return {
    name: morning ? "morning-star" : "evening-star",
    direction: morning ? "bullish" : "bearish",
    strength: Math.min(1, Math.max(0, penetration)),
  };
}

function detectThreeSoldiersOrCrows(bars: [OhlcvBar, OhlcvBar, OhlcvBar]): PatternMatch | null {
  const a = bars.map(anatomy);
  const allBullish = a.every((x) => x.isBullish) && a.every((x) => x.body > 0);
  const allBearish = a.every((x) => !x.isBullish) && a.every((x) => x.body > 0);

  if (allBullish) {
    const risingCloses = bars[1].close > bars[0].close && bars[2].close > bars[1].close;
    const opensWithinPriorBody = bars[1].open >= bars[0].open && bars[1].open <= bars[0].close && bars[2].open >= bars[1].open && bars[2].open <= bars[1].close;
    const smallUpperWicks = a.every((x) => x.upperWick <= x.body * 0.3);
    if (risingCloses && opensWithinPriorBody && smallUpperWicks) {
      return { name: "three-white-soldiers", direction: "bullish", strength: 0.8 };
    }
  }
  if (allBearish) {
    const fallingCloses = bars[1].close < bars[0].close && bars[2].close < bars[1].close;
    const opensWithinPriorBody = bars[1].open <= bars[0].open && bars[1].open >= bars[0].close && bars[2].open <= bars[1].open && bars[2].open >= bars[1].close;
    const smallLowerWicks = a.every((x) => x.lowerWick <= x.body * 0.3);
    if (fallingCloses && opensWithinPriorBody && smallLowerWicks) {
      return { name: "three-black-crows", direction: "bearish", strength: 0.8 };
    }
  }
  return null;
}

/**
 * Runs every detector against the most recent bars (patterns need 1-3 bars
 * of context, per the plan). `trend` disambiguates the shapes that mean
 * opposite things depending on what preceded them (hammer vs. hanging-man,
 * shooting-star vs. inverted-hammer) — pass the EMA(9)/EMA(21) crossover
 * direction computed by the caller.
 */
export function detectPatterns(bars: OhlcvBar[], trend: TrendContext = "neutral"): PatternMatch[] {
  if (bars.length === 0) return [];
  const matches: PatternMatch[] = [];
  const last = bars[bars.length - 1];

  const doji = detectDoji(last);
  if (doji) matches.push(doji);

  const hammer = detectHammerShape(last, trend);
  if (hammer) matches.push(hammer);

  const star = detectShootingStarShape(last, trend);
  if (star) matches.push(star);

  if (bars.length >= 2) {
    const engulfing = detectEngulfing(bars[bars.length - 2], last);
    if (engulfing) matches.push(engulfing);
  }

  if (bars.length >= 3) {
    const threeBar = bars.slice(-3) as [OhlcvBar, OhlcvBar, OhlcvBar];
    const morningEvening = detectStar(threeBar[0], threeBar[1], threeBar[2]);
    if (morningEvening) matches.push(morningEvening);

    const soldiersOrCrows = detectThreeSoldiersOrCrows(threeBar);
    if (soldiersOrCrows) matches.push(soldiersOrCrows);
  }

  return matches;
}
