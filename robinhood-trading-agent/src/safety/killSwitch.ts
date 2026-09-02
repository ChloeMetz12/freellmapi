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

const MANUAL_HALT_FALLBACK_REASON = "Manually halted — run `cli resume` to clear.";

/**
 * The single gate `execution/` must pass before any order is placed.
 * While already halted (manual or auto), this deliberately returns early
 * WITHOUT running checkDailyLoss's rebaseline — resuming later should
 * compare against the equity baseline from before the halt, not one that
 * drifted while halted. Once the day rolls over, checkDailyLoss's own
 * date-mismatch rebaseline still fires correctly on the first check after
 * resume. Order of the two triggered-this-call checks below only matters
 * for which reason gets reported first when both trip at once.
 */
export function evaluateSafety(state: SafetyState, input: SafetyCheckInput): SafetyCheckResult {
  const now = input.now ?? new Date();

  if (state.manuallyHalted || state.autoHaltReason) {
    // `state.autoHaltReason` also holds the operator-supplied reason for a
    // manual halt (see `halt()` below) — surface it instead of a generic
    // string so (a) the real reason isn't hidden from callers and (b) a
    // caller comparing this reason against the state's stored
    // autoHaltReason to detect a *newly triggered* auto-halt doesn't get a
    // false positive every time (see ToolHandlers.checkSafety).
    return { halted: true, reason: state.autoHaltReason ?? MANUAL_HALT_FALLBACK_REASON, updatedState: state };
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
