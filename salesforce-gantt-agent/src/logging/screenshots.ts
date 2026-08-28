import type { Page } from "playwright";
import { join } from "node:path";

/**
 * Captures a screenshot after every significant step (and on every error)
 * for auditability -- this automates real production scheduling, so every
 * run needs to be reviewable after the fact.
 */
export async function captureScreenshot(page: Page, runDir: string, stepLabel: string): Promise<string> {
  const safeLabel = stepLabel.replace(/[^a-z0-9-_]+/gi, "-").toLowerCase();
  const filename = `${Date.now()}-${safeLabel}.png`;
  const path = join(runDir, filename);
  await page.screenshot({ path });
  return filename;
}
