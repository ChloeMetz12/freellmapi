import type { ResolvedWorkOrder } from "../schema/workOrder.js";

export interface DispatchedOutcome {
  type: "Dispatched";
  workOrderUrl: string;
  serviceAppointmentUrl: string;
  assignedTechnician: string;
}

export interface NeedsManualAssignmentOutcome {
  type: "NeedsManualAssignment";
  reason: "no-candidates" | "get-candidates-error";
  workOrderUrl: string;
  serviceAppointmentUrl: string;
}

export interface PendingConfirmationOutcome {
  type: "PendingConfirmation";
  runId: string;
  proposedTechnician: string;
  workOrderUrl: string;
  serviceAppointmentUrl: string;
  resolvedWorkOrder: ResolvedWorkOrder;
}

export interface FailedOutcome {
  type: "Failed";
  step: string;
  error: string;
}

export interface CancelledOutcome {
  type: "Cancelled";
  runId: string;
}

export type Outcome = DispatchedOutcome | NeedsManualAssignmentOutcome | PendingConfirmationOutcome | FailedOutcome | CancelledOutcome;
