#!/usr/bin/env tsx
/**
 * Regenerates sample-ohlcv.json: synthetic 5-minute bars with a mild
 * upward drift, cyclical swings, and pseudo-random noise (seeded, so the
 * output is reproducible) — a stand-in for real historical data until the
 * `RobinHood_Trade` connector is authorized and real history can be
 * pulled instead (see plan Verification step 2).
 */
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import type { OhlcvBar } from "../../src/marketdata/types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function generate(count: number, startPrice: number, seed: number): OhlcvBar[] {
  const rand = mulberry32(seed);
  const bars: OhlcvBar[] = [];
  let price = startPrice;
  const start = new Date("2026-08-01T13:30:00.000Z");

  for (let i = 0; i < count; i++) {
    const drift = 0.0003;
    const cycle = Math.sin(i / 20) * 0.002;
    const noise = (rand() - 0.5) * 0.006;
    const changePct = drift + cycle + noise;

    const open = price;
    const close = open * (1 + changePct);
    const high = Math.max(open, close) * (1 + rand() * 0.002);
    const low = Math.min(open, close) * (1 - rand() * 0.002);
    const volume = Math.round(500_000 + rand() * 300_000);

    bars.push({
      timestamp: new Date(start.getTime() + i * 5 * 60_000).toISOString(),
      open: Number(open.toFixed(2)),
      high: Number(high.toFixed(2)),
      low: Number(low.toFixed(2)),
      close: Number(close.toFixed(2)),
      volume,
    });
    price = close;
  }
  return bars;
}

const bars = generate(300, 500, 42);
writeFileSync(join(__dirname, "sample-ohlcv.json"), JSON.stringify(bars, null, 2));
console.log(`Wrote ${bars.length} bars to sample-ohlcv.json`);
