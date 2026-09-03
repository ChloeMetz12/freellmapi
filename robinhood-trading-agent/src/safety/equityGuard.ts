import { RISK_LIMITS } from "../config/riskLimits.js";
import type { SafetyState } from "./state.js";

function todayIso(now: Date): string {
  return now.toISOString().slice(0, 10);
}

export interface EquityCheckResult {
  triggered: boolean;
  reason?: string;
  /** The (possibly rebaselined) state to persist — call sites must save this. */
  updatedState: SafetyState;
}

/**
 * Rebaselines `dayStartEquity` at the first check of a new calendar day (or
 * whenever it's missing — e.g. a fresh/recovered state — not only on a date
 * change: a partially-persisted state with today's date but no baseline
 * must not silently fall back to comparing currentEquity against itself
 * every call, which would make the daily-loss halt a permanent no-op for
 * the rest of that day), then checks today's drawdown against the hard
 * daily-loss halt fraction. This is the one non-optional backstop in an
 * otherwise fully autonomous, uncapped-position-size design (see plan
 * Context).
 */
export function checkDailyLoss(state: SafetyState, currentEquity: number, now: Date = new Date()): EquityCheckResult {
  const today = todayIso(now);
  let updatedState = state;

  if (state.dayStartDateIso !== today || state.dayStartEquity === null) {
    updatedState = { ...state, dayStartDateIso: today, dayStartEquity: currentEquity };
    return { triggered: false, updatedState };
  }

  const baseline = state.dayStartEquity;
  if (baseline <= 0) return { triggered: false, updatedState };

  const lossFraction = (baseline - currentEquity) / baseline;
  if (lossFraction >= RISK_LIMITS.dailyLossHaltFraction) {
    return {
      triggered: true,
      reason: `Daily equity loss ${(lossFraction * 100).toFixed(2)}% >= ${(RISK_LIMITS.dailyLossHaltFraction * 100).toFixed(0)}% halt threshold (start-of-day equity $${baseline.toFixed(2)}, current $${currentEquity.toFixed(2)})`,
      updatedState,
    };
  }
  return { triggered: false, updatedState };
}
