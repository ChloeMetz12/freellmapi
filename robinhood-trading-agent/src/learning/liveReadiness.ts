import { RISK_LIMITS } from "../config/riskLimits.js";
import type { ClosedTradeSummary } from "./reflection.js";

export interface LiveReadinessResult {
  ready: boolean;
  tradeCount: number;
  tradingDaySpan: number;
  winRate: number;
  cumulativeReturnPct: number;
  maxSingleTradeGainShare: number;
  /**
   * Largest peak-to-trough decline (as a fraction of the peak) across the
   * window's equity readings. This is a proxy for "would this ever have
   * approached the daily-loss kill-switch" — it isn't literally a per-day
   * figure, since equity is only sampled at trade-close events here, not
   * continuously. A real intraday spike-and-recover between two trade
   * closes would not show up in this number.
   */
  maxDrawdownFraction: number;
  checks: {
    enoughTrades: boolean;
    enoughTradingDays: boolean;
    winRateOk: boolean;
    netProfitable: boolean;
    notCarriedByOneOutlier: boolean;
    neverApproachedKillSwitch: boolean;
  };
}

const NOT_READY_EMPTY: LiveReadinessResult = {
  ready: false,
  tradeCount: 0,
  tradingDaySpan: 0,
  winRate: 0,
  cumulativeReturnPct: 0,
  maxSingleTradeGainShare: 0,
  maxDrawdownFraction: 0,
  checks: {
    enoughTrades: false,
    enoughTradingDays: false,
    winRateOk: false,
    netProfitable: false,
    notCarriedByOneOutlier: false,
    neverApproachedKillSwitch: false,
  },
};

/**
 * Evaluates the dry-run trade history against RISK_LIMITS.liveReadiness and
 * reports whether it looks ready for a human to consider flipping
 * MODE=live — it never flips MODE itself (see check_live_readiness's tool
 * description). "Ready" requires every check to pass, not just a positive
 * cumulative return: a short, lucky-looking streak is exactly the false
 * signal this is meant to screen out.
 */
export function evaluateLiveReadiness(trades: ClosedTradeSummary[]): LiveReadinessResult {
  if (trades.length === 0) return NOT_READY_EMPTY;

  const limits = RISK_LIMITS.liveReadiness;
  const sorted = [...trades].sort((a, b) => new Date(a.closedAt).getTime() - new Date(b.closedAt).getTime());

  const tradeCount = sorted.length;
  const firstMs = new Date(sorted[0].closedAt).getTime();
  const lastMs = new Date(sorted[sorted.length - 1].closedAt).getTime();
  const tradingDaySpan = Math.floor((lastMs - firstMs) / (24 * 60 * 60 * 1000));

  const wins = sorted.filter((t) => t.realizedReturnPct > 0);
  const winRate = wins.length / tradeCount;

  const cumulativeReturnPct = sorted.reduce((sum, t) => sum + t.realizedReturnPct, 0);

  const totalGains = wins.reduce((sum, t) => sum + t.realizedReturnPct, 0);
  const largestSingleGain = wins.reduce((max, t) => Math.max(max, t.realizedReturnPct), 0);
  // No wins at all means there's nothing for one trade to "carry" — that
  // case is already caught by winRateOk/netProfitable, so treat share as 0
  // here rather than dividing by zero.
  const maxSingleTradeGainShare = totalGains > 0 ? largestSingleGain / totalGains : 0;

  let peak = sorted[0].currentEquity;
  let maxDrawdownFraction = 0;
  for (const t of sorted) {
    peak = Math.max(peak, t.currentEquity);
    if (peak > 0) {
      maxDrawdownFraction = Math.max(maxDrawdownFraction, (peak - t.currentEquity) / peak);
    }
  }

  const checks = {
    enoughTrades: tradeCount >= limits.minTrades,
    enoughTradingDays: tradingDaySpan >= limits.minTradingDaySpan,
    winRateOk: winRate >= limits.minWinRate,
    netProfitable: cumulativeReturnPct > 0,
    notCarriedByOneOutlier: maxSingleTradeGainShare <= limits.maxSingleTradeGainShare,
    neverApproachedKillSwitch: maxDrawdownFraction < RISK_LIMITS.dailyLossHaltFraction,
  };

  return {
    ready: Object.values(checks).every(Boolean),
    tradeCount,
    tradingDaySpan,
    winRate,
    cumulativeReturnPct,
    maxSingleTradeGainShare,
    maxDrawdownFraction,
    checks,
  };
}
