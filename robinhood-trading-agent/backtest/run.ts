#!/usr/bin/env tsx
/**
 * Walk-forward backtest of the fixed baseline strategy (no sentiment, no
 * learning) over historical/fixture OHLCV bars — see plan Verification
 * step 2. Run with `npm run backtest`. Reports win rate and cumulative
 * return; this is a sanity check on the strategy's shape, not a promise
 * of live performance.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { computeSignal } from "../src/strategy/signal.js";
import { DEFAULT_SIGNAL_WEIGHTS } from "../src/strategy/types.js";
import type { OhlcvBar } from "../src/marketdata/types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

const MIN_HISTORY = 50;
const HOLD_BARS = 5;

interface Trade {
  entryIndex: number;
  exitIndex: number;
  direction: "BUY" | "SELL";
  returnPct: number;
}

function runBacktest(bars: OhlcvBar[]): Trade[] {
  const trades: Trade[] = [];
  let openTrade: { entryIndex: number; direction: "BUY" | "SELL"; entryPrice: number } | null = null;

  for (let i = MIN_HISTORY; i < bars.length; i++) {
    const window = bars.slice(0, i + 1);

    if (openTrade && i - openTrade.entryIndex >= HOLD_BARS) {
      const exitPrice = bars[i].close;
      const raw = (exitPrice - openTrade.entryPrice) / openTrade.entryPrice;
      const returnPct = openTrade.direction === "BUY" ? raw : -raw;
      trades.push({ entryIndex: openTrade.entryIndex, exitIndex: i, direction: openTrade.direction, returnPct });
      openTrade = null;
    }

    if (!openTrade) {
      const decision = computeSignal(window, null, DEFAULT_SIGNAL_WEIGHTS);
      if (decision.action !== "HOLD") {
        openTrade = { entryIndex: i, direction: decision.action, entryPrice: bars[i].close };
      }
    }
  }
  return trades;
}

function report(trades: Trade[]): void {
  if (trades.length === 0) {
    console.log("No trades were opened over this window — the strategy stayed at HOLD throughout.");
    return;
  }
  const wins = trades.filter((t) => t.returnPct > 0);
  const cumulativeReturn = trades.reduce((acc, t) => acc * (1 + t.returnPct), 1) - 1;

  let peak = 1;
  let equity = 1;
  let maxDrawdown = 0;
  for (const t of trades) {
    equity *= 1 + t.returnPct;
    peak = Math.max(peak, equity);
    maxDrawdown = Math.max(maxDrawdown, (peak - equity) / peak);
  }

  console.log(`Trades: ${trades.length}`);
  console.log(`Win rate: ${((wins.length / trades.length) * 100).toFixed(1)}%`);
  console.log(`Cumulative return (compounded, equal sizing): ${(cumulativeReturn * 100).toFixed(2)}%`);
  console.log(`Max drawdown: ${(maxDrawdown * 100).toFixed(2)}%`);
}

const fixturePath = join(__dirname, "fixtures", "sample-ohlcv.json");
const bars: OhlcvBar[] = JSON.parse(readFileSync(fixturePath, "utf-8"));
console.log(`Backtesting over ${bars.length} bars from ${fixturePath}`);
report(runBacktest(bars));
