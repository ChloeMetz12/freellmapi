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
 * Rebaselines `dayStartEquity` at the first check of a new calendar day,
 * then checks today's drawdown against the hard daily-loss halt fraction.
 * This is the one non-optional backstop in an otherwise fully autonomous,
 * uncapped-position-size design (see plan Context).
 */
export function checkDailyLoss(state: SafetyState, currentEquity: number, now: Date = new Date()): EquityCheckResult {
  const today = todayIso(now);
  let updatedState = state;

  if (state.dayStartDateIso !== today) {
    updatedState = { ...state, dayStartDateIso: today, dayStartEquity: currentEquity };
    return { triggered: false, updatedState };
  }

  const baseline = state.dayStartEquity ?? currentEquity;
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
