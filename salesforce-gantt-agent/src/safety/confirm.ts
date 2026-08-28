import readline from "node:readline/promises";
import type { PendingConfirmationOutcome } from "../workflow/outcomes.js";

/**
 * The single most irreversible action this tool can take -- setting a
 * Service Appointment's status to Dispatched, which pushes the job to a
 * technician's mobile app -- is never folded into the same call as
 * everything before it, even in live mode.
 *
 * In the MCP server this is modeled as a second tool call
 * (`confirm_dispatch`) that a human or the calling LLM must explicitly
 * invoke after reviewing a `PendingConfirmation` outcome. In the CLI it's
 * this interactive terminal prompt.
 */
export async function confirmDispatchInteractively(pending: PendingConfirmationOutcome): Promise<boolean> {
  console.log("\nReady to dispatch:");
  console.log(`  Work Order:          ${pending.workOrderUrl}`);
  console.log(`  Service Appointment: ${pending.serviceAppointmentUrl}`);
  console.log(`  Proposed technician: ${pending.proposedTechnician}`);
  console.log(`  Service date:        ${pending.resolvedWorkOrder.serviceDate}`);

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = await rl.question("\nDispatch this appointment now? [y/N] ");
    return /^y(es)?$/i.test(answer.trim());
  } finally {
    rl.close();
  }
}
