import pino from "pino";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

/** Creates a run-scoped logger that writes structured JSON lines into runs/<runId>/run.log. */
export function createRunLogger(runDir: string) {
  mkdirSync(runDir, { recursive: true });
  return pino(pino.destination(join(runDir, "run.log")));
}

/** Generates a sortable, filesystem-safe run id: <ISO timestamp>-<short random>. */
export function generateRunId(): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const random = Math.random().toString(36).slice(2, 8);
  return `${timestamp}-${random}`;
}
