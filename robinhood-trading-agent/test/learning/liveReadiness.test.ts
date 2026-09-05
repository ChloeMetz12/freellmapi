import { describe, it, expect } from "vitest";
import { evaluateLiveReadiness } from "../../src/learning/liveReadiness.js";
import type { ClosedTradeSummary } from "../../src/learning/reflection.js";

const DAY_MS = 24 * 60 * 60 * 1000;
const START = new Date("2026-01-01T00:00:00Z").getTime();

function trade(dayOffset: number, realizedReturnPct: number, currentEquity: number): ClosedTradeSummary {
  return {
    symbol: "AAPL",
    action: "BUY",
    realizedReturnPct,
    closedAt: new Date(START + dayOffset * DAY_MS).toISOString(),
    currentEquity,
  };
}

/** 50 trades spanning 15 days, 26 modest wins / 24 modest losses, equity climbing gently with no deep dip. */
function goodTrackRecord(): ClosedTradeSummary[] {
  const trades: ClosedTradeSummary[] = [];
  let equity = 10_000;
  for (let i = 0; i < 50; i++) {
    const isWin = i % 25 < 13; // 26 wins, 24 losses across 50 trades
    const ret = isWin ? 0.02 : -0.01;
    equity += isWin ? 40 : -20;
    trades.push(trade((i / 50) * 15, ret, equity));
  }
  return trades;
}

describe("evaluateLiveReadiness", () => {
  it("is not ready with no trades at all", () => {
    const result = evaluateLiveReadiness([]);
    expect(result.ready).toBe(false);
    expect(result.tradeCount).toBe(0);
  });

  it("is ready when every criterion holds", () => {
    const result = evaluateLiveReadiness(goodTrackRecord());
    expect(result.checks.enoughTrades).toBe(true);
    expect(result.checks.enoughTradingDays).toBe(true);
    expect(result.checks.winRateOk).toBe(true);
    expect(result.checks.netProfitable).toBe(true);
    expect(result.checks.notCarriedByOneOutlier).toBe(true);
    expect(result.checks.neverApproachedKillSwitch).toBe(true);
    expect(result.ready).toBe(true);
  });

  it("is not ready with fewer than the minimum trade count", () => {
    const trades = goodTrackRecord().slice(0, 30);
    const result = evaluateLiveReadiness(trades);
    expect(result.checks.enoughTrades).toBe(false);
    expect(result.ready).toBe(false);
  });

  it("is not ready when all trades happen within too short a span", () => {
    const trades = goodTrackRecord().map((t, i) => trade(i * 0.05, t.realizedReturnPct, t.currentEquity)); // ~2.5 days total
    const result = evaluateLiveReadiness(trades);
    expect(result.checks.enoughTradingDays).toBe(false);
    expect(result.ready).toBe(false);
  });

  it("is not ready when win rate is below the threshold despite net profit", () => {
    // A handful of big wins carry a mostly-losing record to net-positive.
    const trades: ClosedTradeSummary[] = [];
    let equity = 10_000;
    for (let i = 0; i < 50; i++) {
      const isWin = i < 10; // 10 wins / 50 = 20% win rate
      const ret = isWin ? 0.05 : -0.005;
      equity += isWin ? 100 : -10;
      trades.push(trade((i / 50) * 15, ret, equity));
    }
    const result = evaluateLiveReadiness(trades);
    expect(result.winRate).toBeLessThan(0.45);
    expect(result.checks.winRateOk).toBe(false);
    expect(result.checks.netProfitable).toBe(true);
    expect(result.ready).toBe(false);
  });

  it("is not ready when net cumulative return is negative despite an adequate win rate", () => {
    // Enough small wins to clear the win-rate bar, but a couple of large
    // losses erase all of it net.
    const trades: ClosedTradeSummary[] = [];
    let equity = 10_000;
    for (let i = 0; i < 50; i++) {
      const isBigLoss = i === 10 || i === 30;
      const isWin = !isBigLoss && i % 2 === 0; // ~48% win rate
      const ret = isBigLoss ? -0.5 : isWin ? 0.01 : -0.01;
      equity += ret * 1000;
      trades.push(trade((i / 50) * 15, ret, equity));
    }
    const result = evaluateLiveReadiness(trades);
    expect(result.winRate).toBeGreaterThanOrEqual(0.45);
    expect(result.cumulativeReturnPct).toBeLessThan(0);
    expect(result.checks.netProfitable).toBe(false);
    expect(result.ready).toBe(false);
  });

  it("is not ready when one outlier trade carries the entire gain", () => {
    const trades: ClosedTradeSummary[] = [];
    let equity = 10_000;
    for (let i = 0; i < 50; i++) {
      const isTheOutlier = i === 25;
      const isWin = isTheOutlier || i % 2 === 0;
      const ret = isTheOutlier ? 0.9 : isWin ? 0.001 : -0.001;
      equity += ret * 1000;
      trades.push(trade((i / 50) * 15, ret, equity));
    }
    const result = evaluateLiveReadiness(trades);
    expect(result.checks.netProfitable).toBe(true);
    expect(result.maxSingleTradeGainShare).toBeGreaterThan(0.5);
    expect(result.checks.notCarriedByOneOutlier).toBe(false);
    expect(result.ready).toBe(false);
  });

  it("is not ready when the equity curve would have tripped the daily-loss kill-switch", () => {
    const good = goodTrackRecord();
    // Inject a deep mid-window dip (>10% off the peak) that fully recovers
    // by the end — net profitable, but it should have halted along the way.
    const peak = Math.max(...good.map((t) => t.currentEquity));
    const withDip = good.map((t, i) => (i === 25 ? { ...t, currentEquity: peak * 0.85 } : t));
    const result = evaluateLiveReadiness(withDip);
    expect(result.checks.netProfitable).toBe(true);
    expect(result.maxDrawdownFraction).toBeGreaterThanOrEqual(0.1);
    expect(result.checks.neverApproachedKillSwitch).toBe(false);
    expect(result.ready).toBe(false);
  });
});
