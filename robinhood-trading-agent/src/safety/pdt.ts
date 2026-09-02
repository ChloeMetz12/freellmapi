import { RISK_LIMITS } from "../config/riskLimits.js";
import type { AssetClass } from "../config/watchlist.js";
import type { PdtTradeRecord, SafetyState } from "./state.js";

function isWeekend(date: Date): boolean {
  const day = date.getUTCDay();
  return day === 0 || day === 6;
}

/**
 * The most recent `n` weekdays (Mon-Fri), including today if today is a
 * weekday, as YYYY-MM-DD strings. This is an approximation of FINRA
 * "business days" — it treats U.S. market holidays as ordinary trading
 * days, so around a holiday the specific 5 days in this window can differ
 * from the exchange's actual rolling 5-business-day PDT window (e.g. a
 * trade made on the real window's oldest trading day can fall just outside
 * this approximation's window, or vice versa). This is not guaranteed to
 * be conservative in either direction — do not treat it as a substitute
 * for a real market-holiday calendar in a compliance-sensitive deployment.
 */
function lastNBusinessDays(now: Date, n: number): Set<string> {
  const days = new Set<string>();
  const cursor = new Date(now);
  while (days.size < n) {
    if (!isWeekend(cursor)) days.add(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }
  return days;
}

export interface PdtCheckResult {
  allowed: boolean;
  reason?: string;
}

/**
 * FINRA's pattern-day-trader rule only restricts equities, and only below
 * $25k account equity — crypto is unaffected (see plan Open Risks).
 */
export function canRecordDayTrade(state: SafetyState, assetClass: AssetClass, currentEquity: number, now: Date = new Date()): PdtCheckResult {
  if (assetClass === "crypto") return { allowed: true };
  if (currentEquity >= RISK_LIMITS.pdtEquityThresholdUsd) return { allowed: true };

  const window = lastNBusinessDays(now, RISK_LIMITS.pdtRollingWindowDays);
  const count = state.pdtTrades.filter((t) => window.has(t.dateIso)).length;
  if (count >= RISK_LIMITS.pdtMaxDayTrades) {
    return {
      allowed: false,
      reason: `PDT limit reached: ${count} day trades in the last ${RISK_LIMITS.pdtRollingWindowDays} business days with equity $${currentEquity.toFixed(2)} < $${RISK_LIMITS.pdtEquityThresholdUsd} threshold`,
    };
  }
  return { allowed: true };
}

/** Records a same-day round-trip trade and prunes entries well outside any rolling window this rule will ever check. */
export function recordDayTrade(state: SafetyState, symbol: string, now: Date = new Date()): SafetyState {
  const record: PdtTradeRecord = { symbol, dateIso: now.toISOString().slice(0, 10) };
  const cutoff = new Date(now);
  cutoff.setUTCDate(cutoff.getUTCDate() - RISK_LIMITS.pdtRollingWindowDays * 3);
  const cutoffIso = cutoff.toISOString().slice(0, 10);

  return {
    ...state,
    pdtTrades: [...state.pdtTrades.filter((t) => t.dateIso >= cutoffIso), record],
  };
}
