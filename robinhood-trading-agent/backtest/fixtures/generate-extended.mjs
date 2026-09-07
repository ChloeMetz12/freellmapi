#!/usr/bin/env node
/**
 * Deterministic, dependency-free generator for a longer, multi-regime OHLCV
 * fixture used by `npm run backtest -- backtest/fixtures/extended-ohlcv.json`.
 *
 * It is seeded (mulberry32) so the output is byte-stable across runs — the
 * committed extended-ohlcv.json is exactly what this prints. Regenerate with:
 *
 *   node backtest/fixtures/generate-extended.mjs > backtest/fixtures/extended-ohlcv.json
 *
 * The series is NOT real market data and is not tuned to be profitable; it
 * stitches together several drift/volatility regimes (uptrend, chop, sell-off,
 * recovery, high-vol whipsaw) so the walk-forward harness is exercised across
 * conditions rather than one smooth ramp like the small sample fixture.
 */

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rand = mulberry32(0x9e3779b9);
// Standard-normal via Box–Muller, driven by the seeded uniform generator.
function gauss() {
  const u1 = Math.max(rand(), 1e-9);
  const u2 = rand();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

// Each regime: number of 5-minute bars, per-bar drift (fractional), and
// per-bar volatility (fractional stddev). Ordered to form one continuous path.
const regimes = [
  { name: "uptrend",        bars: 480, drift: 0.0006,  vol: 0.004 },
  { name: "chop",           bars: 480, drift: 0.0,     vol: 0.006 },
  { name: "selloff",        bars: 480, drift: -0.0009, vol: 0.007 },
  { name: "recovery",       bars: 480, drift: 0.0007,  vol: 0.005 },
  { name: "highvol_whipsaw",bars: 480, drift: 0.0001,  vol: 0.012 },
];

const START_PRICE = 250;
const BAR_MS = 5 * 60 * 1000;
// Anchor to a plausible session open; timestamps just need to be strictly
// ascending, valid ISO — the strategy is timestamp-order sensitive, not
// calendar-aware in the backtest harness.
let t = Date.parse("2026-03-02T14:30:00.000Z");
let price = START_PRICE;

const bars = [];
for (const regime of regimes) {
  for (let i = 0; i < regime.bars; i++) {
    const open = price;
    const ret = regime.drift + regime.vol * gauss();
    let close = open * (1 + ret);
    if (close <= 1) close = 1 + rand(); // guard against a degenerate walk to <=0
    // Intrabar extremes: push high/low beyond the open/close range by a
    // fraction of the bar's volatility so candlestick/ATR signals have wicks.
    const spread = Math.abs(close - open) + open * regime.vol * (0.3 + 0.7 * rand());
    const high = Math.max(open, close) + spread * (0.2 + 0.8 * rand());
    const low = Math.min(open, close) - spread * (0.2 + 0.8 * rand());
    const volume = Math.round(300_000 + 500_000 * rand() * (1 + regime.vol * 40));
    bars.push({
      timestamp: new Date(t).toISOString(),
      open: round2(open),
      high: round2(high),
      low: round2(Math.max(low, 0.5)),
      close: round2(close),
      volume,
    });
    price = close;
    t += BAR_MS;
  }
}

function round2(x) {
  return Math.round(x * 100) / 100;
}

process.stdout.write(JSON.stringify(bars, null, 0) + "\n");
