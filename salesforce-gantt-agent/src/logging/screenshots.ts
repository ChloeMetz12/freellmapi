import type { Page } from "playwright";
import { join, resolve } from "node:path";

/**
 * Captures a screenshot after every significant step (and on every error)
 * for auditability -- this automates real production scheduling, so every
 * run needs to be reviewable after the fact.
 *
 * Also prints a `SCREENSHOT:<absolute path>` marker line to stdout. This
 * tool runs in an environment with no live remote-desktop/VNC access to
 * the virtual display, so this marker is the mechanism for watching a run
 * "as it happens": whoever launches the CLI/MCP server (e.g. a Claude
 * session driving it via a background process) can tail stdout for these
 * lines and relay each screenshot as soon as it's captured, rather than
 * only being able to review them after the run finishes.
 */
export async function captureScreenshot(page: Page, runDir: string, stepLabel: string): Promise<string> {
  const safeLabel = stepLabel.replace(/[^a-z0-9-_]+/gi, "-").toLowerCase();
  const filename = `${Date.now()}-${safeLabel}.png`;
  const path = join(runDir, filename);
  await page.screenshot({ path });
  process.stdout.write(`SCREENSHOT:${resolve(path)}\n`);
  return filename;
}
