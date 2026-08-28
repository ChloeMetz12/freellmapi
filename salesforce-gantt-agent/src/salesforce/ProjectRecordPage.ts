import type { RunContext } from "../types.js";
import type { RunRecorder } from "../logging/runRecorder.js";
import { guardedAction } from "../safety/dryRun.js";
import { selectors } from "../config/selectors.js";

export interface ExtractedProjectFields {
  recordUrl: string;
  installScheduledDate?: string;
  description?: string;
}

/**
 * Locates the source project/Opportunity record and extracts whatever
 * fields it can, mirroring how the manual process copies information from
 * the project record into the new Install Work Order form. Then triggers
 * the "Install Work Order" creation button -- NEVER a manually-created
 * Case/Work Order, which mis-tags the job as "Service" instead of
 * "Install" per the training transcript.
 */
export class ProjectRecordPage {
  constructor(private ctx: RunContext) {}

  /**
   * Navigates to the project record. `projectIdentifier` is resolved via
   * Salesforce global search since we don't know the org's exact record
   * URL scheme for projects/Opportunities ahead of the discovery phase.
   */
  async open(projectIdentifier: string): Promise<void> {
    const { page } = this.ctx;
    await page.goto(new URL(`/one/one.app#/sObject/search/${encodeURIComponent(projectIdentifier)}`, page.url()).toString()).catch(async () => {
      // Fallback: use the global search box directly if a deep search link isn't supported by this org.
      await page.getByRole("searchbox").first().fill(projectIdentifier);
      await page.keyboard.press("Enter");
    });
    await page.getByText(projectIdentifier, { exact: false }).first().click();
  }

  async extractFields(): Promise<ExtractedProjectFields> {
    const { page } = this.ctx;
    const recordUrl = page.url();

    const installScheduledDate = await page
      .getByLabel(selectors.projectRecord.fields.installScheduledDate)
      .first()
      .textContent()
      .catch(() => null);

    const description = await page
      .getByLabel(selectors.projectRecord.fields.description)
      .first()
      .textContent()
      .catch(() => null);

    return {
      recordUrl,
      installScheduledDate: installScheduledDate?.trim() || undefined,
      description: description?.trim() || undefined,
    };
  }

  /**
   * Clicks Install Work Order -> New -> Save. Returns the created Work
   * Order's URL so the workflow can navigate there next.
   */
  async createInstallWorkOrder(recorder: RunRecorder): Promise<string> {
    const { page } = this.ctx;

    return guardedAction(
      this.ctx,
      recorder,
      "create-install-work-order",
      { source: page.url() },
      async () => {
        await page.getByRole(selectors.projectRecord.installWorkOrderButton.role, { name: selectors.projectRecord.installWorkOrderButton.name }).click();
        await page.getByRole(selectors.projectRecord.newOptionInDialog.role, { name: selectors.projectRecord.newOptionInDialog.name }).click();
        await page.getByRole(selectors.projectRecord.saveButton.role, { name: selectors.projectRecord.saveButton.name }).click();
        await page.waitForLoadState("networkidle");
        return page.url();
      },
      // Dry-run: no Work Order was actually created, so there's no real URL to return.
      "dry-run://no-work-order-created",
    );
  }
}
