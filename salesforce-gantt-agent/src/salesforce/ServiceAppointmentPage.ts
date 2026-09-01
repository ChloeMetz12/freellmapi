import type { RunContext } from "../types.js";
import type { RunRecorder } from "../logging/runRecorder.js";
import { guardedAction } from "../safety/dryRun.js";
import { selectors } from "../config/selectors.js";

export type GetCandidatesResult = { status: "ranked"; topCandidate: string } | { status: "no-candidates" } | { status: "error"; message: string };

/**
 * Clicks "Get Candidates" and reports what happened. Per the training
 * transcript this is unreliable ("it works, sometimes it doesn't work"),
 * so this page object distinguishes "returned zero candidates" from
 * "errored outright" -- both currently map to NeedsManualAssignment
 * upstream, but discovery-phase testing may reveal they need different
 * handling (see config/selectors.ts and README "open risks").
 *
 * IMPORTANT: this tool never guesses a drag-and-drop assignment itself.
 * If Get Candidates doesn't produce a usable ranked technician, the
 * workflow stops here and flags the job for manual assignment.
 */
export class ServiceAppointmentPage {
  constructor(private ctx: RunContext) {}

  async open(serviceAppointmentUrl: string): Promise<void> {
    if (serviceAppointmentUrl.startsWith("dry-run://")) return;
    await this.ctx.page.goto(serviceAppointmentUrl);
  }

  async getCandidates(recorder: RunRecorder): Promise<GetCandidatesResult> {
    const { page } = this.ctx;

    return guardedAction(
      this.ctx,
      recorder,
      "get-candidates",
      {},
      async (): Promise<GetCandidatesResult> => {
        await page.getByRole(selectors.serviceAppointment.getCandidatesButton.role, { name: selectors.serviceAppointment.getCandidatesButton.name }).click();

        const noCandidates = page.getByText(selectors.serviceAppointment.noCandidatesText);
        const candidateList = page.getByRole(selectors.serviceAppointment.candidateListContainer.role, {
          name: selectors.serviceAppointment.candidateListContainer.name,
        });

        const result = await Promise.race([
          noCandidates.waitFor({ state: "visible", timeout: 15000 }).then(() => "no-candidates" as const),
          candidateList.waitFor({ state: "visible", timeout: 15000 }).then(() => "ranked" as const),
        ]).catch(() => "error" as const);

        if (result === "no-candidates") return { status: "no-candidates" };
        if (result === "error") return { status: "error", message: "Get Candidates did not return a recognizable result within 15s" };

        const topCandidate = await candidateList.getByRole(selectors.serviceAppointment.candidateListItem.role).first().textContent();
        if (!topCandidate?.trim()) return { status: "no-candidates" };
        return { status: "ranked", topCandidate: topCandidate.trim() };
      },
      // Dry-run: no real Get Candidates call was made, so simulate a
      // successful ranked result -- otherwise the workflow could never
      // exercise its Dispatched path in dry-run mode.
      { status: "ranked", topCandidate: "Dry Run Technician" },
    );
  }

  async selectCandidate(recorder: RunRecorder, candidateName: string): Promise<void> {
    const { page } = this.ctx;
    await guardedAction(
      this.ctx,
      recorder,
      "select-candidate",
      { candidateName },
      async () => {
        await page.getByText(candidateName, { exact: true }).click();
      },
      undefined,
    );
  }
}
