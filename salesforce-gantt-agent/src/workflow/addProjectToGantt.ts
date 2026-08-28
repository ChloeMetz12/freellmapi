import type { Env } from "../config/env.js";
import type { AddProjectInput } from "../schema/input.js";
import type { ResolvedWorkOrder } from "../schema/workOrder.js";
import { resolvedWorkOrderSchema } from "../schema/workOrder.js";
import type { RunContext } from "../types.js";
import { openAuthenticatedSession, SessionExpiredError, type AuthenticatedSession } from "../auth/session.js";
import { generateRunId, createRunLogger } from "../logging/logger.js";
import { RunRecorder } from "../logging/runRecorder.js";
import { ProjectRecordPage } from "../salesforce/ProjectRecordPage.js";
import { WorkOrderPage } from "../salesforce/WorkOrderPage.js";
import { ServiceAppointmentPage } from "../salesforce/ServiceAppointmentPage.js";
import { DispatchConsolePage } from "../salesforce/DispatchConsolePage.js";
import { getNotifier } from "../escalation/index.js";
import { putPendingRun, takePendingRun } from "./pendingRuns.js";
import type { Outcome } from "./outcomes.js";
import { join } from "node:path";

/**
 * Orchestrates the full add-project sequence. Strictly on-demand: this
 * function only ever runs because a caller explicitly named a project --
 * there is no scheduler, watcher, or batch entry point anywhere in this
 * tool.
 *
 * Sequence: open project record -> extract fields -> create Install Work
 * Order -> fill + save Work Order fields -> Get Candidates on the Service
 * Appointment -> if a candidate is found: dry-run resolves straight to
 * Dispatched (nothing real happened), live mode stops at
 * PendingConfirmation and awaits confirmDispatch(). If Get Candidates
 * fails/returns nothing: stop and return NeedsManualAssignment, emailing
 * the user via the escalation notifier.
 */
export async function addProjectToGantt(input: AddProjectInput, env: Env): Promise<Outcome> {
  const runId = generateRunId();
  const runDir = join(process.cwd(), "runs", runId);
  const logger = createRunLogger(runDir);
  const recorder = new RunRecorder(runId, runDir, input, input.dryRun);

  let session: AuthenticatedSession;
  try {
    session = await openAuthenticatedSession(env);
  } catch (err) {
    if (err instanceof SessionExpiredError) {
      return { type: "Failed", step: "authenticate", error: err.message };
    }
    throw err;
  }

  const page = await session.context.newPage();
  const ctx: RunContext = { page, dryRun: input.dryRun, runId, runDir, logger };

  try {
    const projectPage = new ProjectRecordPage(ctx);
    await projectPage.open(input.projectIdentifier);
    const extracted = await projectPage.extractFields();

    const resolved = resolveWorkOrderFields(input, extracted, env);
    const validation = resolvedWorkOrderSchema.safeParse(resolved);
    if (!validation.success) {
      await session.close();
      return {
        type: "Failed",
        step: "resolve-work-order-fields",
        error: `Missing required fields: ${validation.error.issues.map((i) => i.path.join(".")).join(", ")}`,
      };
    }

    const workOrderUrl = await projectPage.createInstallWorkOrder(recorder);

    const workOrderPage = new WorkOrderPage(ctx);
    await workOrderPage.open(workOrderUrl);
    await workOrderPage.fillAndSave(validation.data, recorder);
    const serviceAppointmentUrl = await workOrderPage.getServiceAppointmentUrl();

    const appointmentPage = new ServiceAppointmentPage(ctx);
    await appointmentPage.open(serviceAppointmentUrl);
    const candidates = await appointmentPage.getCandidates(recorder);

    if (candidates.status !== "ranked") {
      const reason = candidates.status === "no-candidates" ? "no-candidates" : "get-candidates-error";
      const outcome: Outcome = { type: "NeedsManualAssignment", reason, workOrderUrl, serviceAppointmentUrl };
      recorder.setOutcome(outcome);
      await recorder.flush();
      await session.close();

      await getNotifier(env)
        .notify({ projectIdentifier: input.projectIdentifier, reason, workOrderUrl, serviceAppointmentUrl, runId })
        .catch((err) => logger.error({ err }, "Escalation email failed to send"));

      return outcome;
    }

    await appointmentPage.selectCandidate(recorder, candidates.topCandidate);

    if (ctx.dryRun) {
      const outcome: Outcome = {
        type: "Dispatched",
        workOrderUrl,
        serviceAppointmentUrl,
        assignedTechnician: candidates.topCandidate,
      };
      recorder.setOutcome(outcome);
      await recorder.flush();
      await session.close();
      return outcome;
    }

    // Live mode: stop here and hold the session open until confirm_dispatch is called.
    putPendingRun(runId, {
      ctx,
      session,
      recorder,
      serviceAppointmentUrl,
      workOrderUrl,
      proposedTechnician: candidates.topCandidate,
      resolvedWorkOrder: validation.data,
    });

    const outcome: Outcome = {
      type: "PendingConfirmation",
      runId,
      proposedTechnician: candidates.topCandidate,
      workOrderUrl,
      serviceAppointmentUrl,
      resolvedWorkOrder: validation.data,
    };
    recorder.setOutcome(outcome);
    await recorder.flush();
    return outcome;
  } catch (err) {
    await recorder.flush();
    await session.close();
    return { type: "Failed", step: "add-project-to-gantt", error: (err as Error).message };
  }
}

/** Resumes a run left in PendingConfirmation, either dispatching or cancelling it. */
export async function confirmDispatch(runId: string, approve: boolean): Promise<Outcome> {
  const run = takePendingRun(runId);
  if (!run) {
    return { type: "Failed", step: "confirm-dispatch", error: `No pending run found for runId ${runId} (already confirmed, expired, or the process restarted).` };
  }

  try {
    if (!approve) {
      run.recorder.addStep({ step: "dispatch-cancelled", startedAt: new Date().toISOString(), finishedAt: new Date().toISOString(), outcome: "ok" });
      await run.recorder.flush();
      return { type: "Cancelled", runId };
    }

    const dispatchPage = new DispatchConsolePage(run.ctx);
    await dispatchPage.setDispatched(run.serviceAppointmentUrl, run.recorder);

    const outcome: Outcome = {
      type: "Dispatched",
      workOrderUrl: run.workOrderUrl,
      serviceAppointmentUrl: run.serviceAppointmentUrl,
      assignedTechnician: run.proposedTechnician,
    };
    run.recorder.setOutcome(outcome);
    await run.recorder.flush();
    return outcome;
  } catch (err) {
    await run.recorder.flush();
    return { type: "Failed", step: "confirm-dispatch", error: (err as Error).message };
  } finally {
    await run.session.close();
  }
}

export function resolveWorkOrderFields(
  input: AddProjectInput,
  extracted: { installScheduledDate?: string; description?: string; recordUrl: string },
  env: Env,
): Partial<ResolvedWorkOrder> {
  return {
    projectIdentifier: input.projectIdentifier,
    projectRecordUrl: extracted.recordUrl,
    owner: env.SF_USER_DISPLAY_NAME,
    dispatcher: env.SF_USER_DISPLAY_NAME,
    workOrderType: input.workOrderType,
    includeBattery: input.includeBattery ?? false,
    includeInstall: input.includeInstall ?? false,
    serviceTerritory: input.serviceTerritory,
    serviceDate: input.serviceDate ?? normalizeDate(extracted.installScheduledDate),
    description: input.description ?? extracted.description ?? "",
  };
}

/** Best-effort normalization of whatever date format the project record's field renders as. Refine after the discovery phase confirms the real format. */
function normalizeDate(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return undefined;
  return parsed.toISOString().slice(0, 10);
}
