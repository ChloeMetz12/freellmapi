import type { RunContext } from "../types.js";
import type { RunRecorder } from "../logging/runRecorder.js";
import { guardedAction } from "../safety/dryRun.js";
import { selectors } from "../config/selectors.js";
import { STATUS } from "../config/constants.js";

/**
 * v1 scope: only the right-click -> Dispatched -> reload-confirm step,
 * used once a technician has already been assigned (either via Get
 * Candidates, or later, manually by a human). This deliberately does NOT
 * implement Day-view navigation or drag-and-drop placement -- there's no
 * reliable "technician is available" signal to automate that against, so
 * manual assignment stays a human task. Those pieces are documented here
 * for a future reschedule feature, not wired into the v1 auto-assign path.
 */
export class DispatchConsolePage {
  constructor(private ctx: RunContext) {}

  async setDispatched(serviceAppointmentUrl: string, recorder: RunRecorder): Promise<void> {
    const { page } = this.ctx;

    if (!serviceAppointmentUrl.startsWith("dry-run://")) {
      await page.goto(serviceAppointmentUrl);
    }

    await guardedAction(
      this.ctx,
      recorder,
      "set-dispatched",
      { serviceAppointmentUrl },
      async () => {
        await page.click("body", { button: "right" });
        await page
          .getByRole(selectors.dispatchConsole.appointmentContextMenu.dispatchedStatusItem.role, {
            name: selectors.dispatchConsole.appointmentContextMenu.dispatchedStatusItem.name,
          })
          .click();
        await page.reload();
        await page.getByText(STATUS.DISPATCHED, { exact: false }).waitFor({ state: "visible", timeout: 10000 });
      },
      undefined,
    );
  }
}
