import { checkDailyLoss } from "./equityGuard.js";
import { checkMarginRisk } from "./marginGuard.js";
import type { SafetyState } from "./state.js";

export interface SafetyCheckInput {
  currentEquity: number;
  /** 0-1, broker's margin maintenance utilization; null if margin isn't in use. */
  marginMaintenanceUtilization: number | null;
  now?: Date;
}

export interface SafetyCheckResult {
  halted: boolean;
  reason: string | null;
  updatedState: SafetyState;
}

/**
 * The single gate `execution/` must pass before any order is placed. Order
 * of checks matters only for which reason gets reported first when
 * several trip at once — every check still runs so the persisted state
 * (e.g. the day-start-equity rebaseline) stays correct regardless.
 */
export function evaluateSafety(state: SafetyState, input: SafetyCheckInput): SafetyCheckResult {
  const now = input.now ?? new Date();

  if (state.manuallyHalted) {
    return { halted: true, reason: "Manually halted — run `cli resume` to clear.", updatedState: state };
  }
  if (state.autoHaltReason) {
    return { halted: true, reason: state.autoHaltReason, updatedState: state };
  }

  const marginCheck = checkMarginRisk(input.marginMaintenanceUtilization);
  const equityCheck = checkDailyLoss(state, input.currentEquity, now);

  if (marginCheck.triggered) {
    const updatedState: SafetyState = { ...equityCheck.updatedState, autoHaltReason: marginCheck.reason! };
    return { halted: true, reason: marginCheck.reason!, updatedState };
  }
  if (equityCheck.triggered) {
    const updatedState: SafetyState = { ...equityCheck.updatedState, autoHaltReason: equityCheck.reason! };
    return { halted: true, reason: equityCheck.reason!, updatedState };
  }

  return { halted: false, reason: null, updatedState: equityCheck.updatedState };
}

/** Manual kill-switch — always available regardless of current state. */
export function halt(state: SafetyState, reason: string): SafetyState {
  return { ...state, manuallyHalted: true, autoHaltReason: state.autoHaltReason ?? reason };
}

/** Clears BOTH the manual flag and any auto-triggered halt reason — the only way either is ever cleared. */
export function resume(state: SafetyState): SafetyState {
  return { ...state, manuallyHalted: false, autoHaltReason: null };
}
