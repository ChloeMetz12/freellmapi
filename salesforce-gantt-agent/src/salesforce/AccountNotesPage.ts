import type { RunContext } from "../types.js";
import type { RunRecorder } from "../logging/runRecorder.js";
import { guardedAction } from "../safety/dryRun.js";
import { selectors } from "../config/selectors.js";

/**
 * Customer-facing notes go on the Account's related list/notes section,
 * never on the Work Order, per the training transcript. Not wired into
 * the v1 add-project workflow -- reserved for a future feature/tool call
 * that logs a note explicitly.
 */
export class AccountNotesPage {
  constructor(private ctx: RunContext) {}

  async addNote(accountUrl: string, noteText: string, recorder: RunRecorder): Promise<void> {
    const { page } = this.ctx;
    if (!accountUrl.startsWith("dry-run://")) {
      await page.goto(accountUrl);
      await page.getByRole(selectors.account.relatedTab.role, { name: selectors.account.relatedTab.name }).click();
    }

    await guardedAction(
      this.ctx,
      recorder,
      "add-account-note",
      { accountUrl, noteText },
      async () => {
        await page.getByRole(selectors.account.newNoteButton.role, { name: selectors.account.newNoteButton.name }).click();
        await page.getByRole("textbox").fill(noteText);
        await page.getByRole("button", { name: /save/i }).click();
      },
      undefined,
    );
  }
}
