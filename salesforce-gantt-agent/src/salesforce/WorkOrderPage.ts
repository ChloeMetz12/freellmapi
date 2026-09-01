import type { RunContext } from "../types.js";
import type { RunRecorder } from "../logging/runRecorder.js";
import { guardedAction } from "../safety/dryRun.js";
import { selectors } from "../config/selectors.js";
import type { ResolvedWorkOrder } from "../schema/workOrder.js";

/**
 * Fills in the Work Order created by ProjectRecordPage.createInstallWorkOrder():
 * Owner, Dispatcher, Work Order Type (+ battery/install sub-options),
 * Service Territory, Service Date, Description. Saves, then reads back the
 * Service Appointment URL Salesforce auto-creates alongside it.
 */
export class WorkOrderPage {
  constructor(private ctx: RunContext) {}

  async open(workOrderUrl: string): Promise<void> {
    if (workOrderUrl.startsWith("dry-run://")) return; // nothing to navigate to in dry-run
    await this.ctx.page.goto(workOrderUrl);
  }

  async fillAndSave(fields: ResolvedWorkOrder, recorder: RunRecorder): Promise<void> {
    const { page } = this.ctx;

    await guardedAction(
      this.ctx,
      recorder,
      "fill-work-order-fields",
      fields,
      async () => {
        await page.getByLabel(selectors.workOrder.ownerField).fill(fields.owner);
        await page.getByLabel(selectors.workOrder.dispatcherField).fill(fields.dispatcher);
        await page.getByLabel(selectors.workOrder.workOrderTypeField).fill(fields.workOrderType);

        if (fields.includeBattery) {
          await page.getByLabel(selectors.workOrder.includeBatteryCheckbox).check();
        }
        if (fields.includeInstall) {
          await page.getByLabel(selectors.workOrder.includeInstallCheckbox).check();
        }

        await page.getByLabel(selectors.workOrder.serviceTerritoryField).fill(fields.serviceTerritory);
        await page.getByLabel(selectors.workOrder.serviceDateField).fill(fields.serviceDate);
        await page.getByLabel(selectors.workOrder.descriptionField).fill(fields.description);

        await page.getByRole(selectors.workOrder.saveButton.role, { name: selectors.workOrder.saveButton.name }).click();
        await page.waitForLoadState("networkidle");
      },
      undefined,
    );
  }

  /** Reads the Service Appointment URL Salesforce auto-created for this Work Order. */
  async getServiceAppointmentUrl(): Promise<string> {
    if (this.ctx.dryRun) return "dry-run://no-service-appointment-created";
    const { page } = this.ctx;
    const link = page.getByRole("link", { name: /service appointment/i }).first();
    const href = await link.getAttribute("href");
    if (!href) throw new Error("Could not find the auto-created Service Appointment link on the Work Order page");
    return new URL(href, page.url()).toString();
  }
}
