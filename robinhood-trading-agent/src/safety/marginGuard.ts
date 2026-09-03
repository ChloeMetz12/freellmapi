import { RISK_LIMITS } from "../config/riskLimits.js";

export interface MarginCheckResult {
  triggered: boolean;
  reason?: string;
}

/**
 * `maintenanceUtilization` is the broker's own fraction of the way toward a
 * margin call (0 = no margin used, 1 = at the call threshold — pass this
 * through from `RobinHood_Trade`'s account/margin fields). Checked
 * independently of, and more urgently than, the daily-loss halt: a margin
 * call can be forced by the broker before the next daily-loss check even
 * runs (see plan Open Risks).
 */
export function checkMarginRisk(maintenanceUtilization: number | null): MarginCheckResult {
  if (maintenanceUtilization === null) return { triggered: false };
  if (maintenanceUtilization >= RISK_LIMITS.marginCallWarningThreshold) {
    return {
      triggered: true,
      reason: `Margin maintenance utilization ${(maintenanceUtilization * 100).toFixed(1)}% >= ${(RISK_LIMITS.marginCallWarningThreshold * 100).toFixed(0)}% warning threshold — halting before a broker-forced margin call`,
    };
  }
  return { triggered: false };
}
