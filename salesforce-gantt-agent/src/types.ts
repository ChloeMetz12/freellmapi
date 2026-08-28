import type { Page } from "playwright";
import type { Logger } from "pino";

/**
 * Threaded through every page object and the workflow orchestrator. Carries
 * everything needed to perform (or, in dry-run mode, simulate) an action
 * against Salesforce, plus the logger/screenshot recorder used to build the
 * per-run audit manifest.
 */
export interface RunContext {
  page: Page;
  dryRun: boolean;
  runId: string;
  runDir: string;
  logger: Logger;
}
