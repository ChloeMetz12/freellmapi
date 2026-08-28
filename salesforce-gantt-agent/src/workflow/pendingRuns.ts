import type { RunContext } from "../types.js";
import type { AuthenticatedSession } from "../auth/session.js";
import type { RunRecorder } from "../logging/runRecorder.js";
import type { ResolvedWorkOrder } from "../schema/workOrder.js";

/**
 * A run that reached the "ready to dispatch" point in live mode holds its
 * browser session open in memory, keyed by runId, until confirm_dispatch
 * is called (approve or not). This only makes sense because the MCP
 * server / CLI process stays alive between the two calls -- if the
 * process restarts, the pending run is lost and the Work Order/Service
 * Appointment are left un-dispatched for manual follow-up (visible in
 * Salesforce and in the run's manifest.json either way).
 */
export interface PendingRun {
  ctx: RunContext;
  session: AuthenticatedSession;
  recorder: RunRecorder;
  serviceAppointmentUrl: string;
  workOrderUrl: string;
  proposedTechnician: string;
  resolvedWorkOrder: ResolvedWorkOrder;
}

const pending = new Map<string, PendingRun>();

export function putPendingRun(runId: string, run: PendingRun): void {
  pending.set(runId, run);
}

export function takePendingRun(runId: string): PendingRun | undefined {
  const run = pending.get(runId);
  if (run) pending.delete(runId);
  return run;
}
