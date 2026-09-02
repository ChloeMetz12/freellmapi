import { RISK_LIMITS } from "../config/riskLimits.js";
import type { AssetClass } from "../config/watchlist.js";
import type { PdtTradeRecord, SafetyState } from "./state.js";

function isWeekend(date: Date): boolean {
  const day = date.getUTCDay();
  return day === 0 || day === 6;
}

/** The most recent `n` business days, including today if today is a business day, as YYYY-MM-DD strings. */
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
