/**
 * Domain constants that are stable regardless of the specific Salesforce org
 * (unlike selectors.ts, which holds org-specific UI strings discovered via
 * the Playwright codegen discovery phase — see README.md).
 */

/** Service territory names follow this pattern per the training transcript, e.g. "Richmond Install". */
export function serviceTerritoryName(city: string): string {
  return `${city} Install`;
}

export const WORK_ORDER_TYPES = {
  SOLAREDGE_BACKUP: "SolarEdge Backup",
} as const;

export type WorkOrderType = (typeof WORK_ORDER_TYPES)[keyof typeof WORK_ORDER_TYPES];

/** Service Appointment / Work Order status values used by this tool. */
export const STATUS = {
  DISPATCHED: "Dispatched",
  RESCHEDULED: "Rescheduled",
  CANNOT_COMPLETE: "Cannot Complete - Additional Work Needed",
} as const;
