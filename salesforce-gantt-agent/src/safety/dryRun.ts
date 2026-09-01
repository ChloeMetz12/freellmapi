import type { RunContext } from "../types.js";
import { captureScreenshot } from "../logging/screenshots.js";
import type { RunRecorder } from "../logging/runRecorder.js";

/**
 * Wraps every state-changing Salesforce action (clicking Save, Get
 * Candidates, changing status to Dispatched). In dry-run mode, the action
 * is NOT performed -- instead it's logged and screenshotted as "would
 * perform: <label>" and `dryRunResult` is returned so the workflow can
 * still be exercised end-to-end. In live mode, `action` actually runs.
 *
 * This is the single choke point all write actions go through, so dry-run
 * safety can't be accidentally bypassed by a page object calling
 * `page.click()` directly.
 */
export async function guardedAction<T>(
  ctx: RunContext,
  recorder: RunRecorder,
  label: string,
  payload: unknown,
  action: () => Promise<T>,
  dryRunResult: T,
): Promise<T> {
  const startedAt = new Date().toISOString();

  if (ctx.dryRun) {
    ctx.logger.info({ label, payload }, `[dry-run] would perform: ${label}`);
    const screenshot = await captureScreenshot(ctx.page, ctx.runDir, `dry-run-${label}`);
    recorder.addStep({ step: label, startedAt, finishedAt: new Date().toISOString(), outcome: "skipped-dry-run", detail: payload, screenshot });
    return dryRunResult;
  }

  try {
    const result = await action();
    const screenshot = await captureScreenshot(ctx.page, ctx.runDir, label);
    recorder.addStep({ step: label, startedAt, finishedAt: new Date().toISOString(), outcome: "ok", detail: payload, screenshot });
    return result;
  } catch (err) {
    const screenshot = await captureScreenshot(ctx.page, ctx.runDir, `error-${label}`).catch(() => undefined);
    recorder.addStep({
      step: label,
      startedAt,
      finishedAt: new Date().toISOString(),
      outcome: "error",
      detail: { payload, error: (err as Error).message },
      screenshot,
    });
    throw err;
  }
}
