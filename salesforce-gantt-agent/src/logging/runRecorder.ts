import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { AddProjectInput } from "../schema/input.js";
import type { Outcome } from "../workflow/outcomes.js";

export interface StepRecord {
  step: string;
  startedAt: string;
  finishedAt: string;
  outcome: "ok" | "skipped-dry-run" | "error";
  detail?: unknown;
  screenshot?: string;
}

export interface RunManifest {
  runId: string;
  dryRun: boolean;
  input: AddProjectInput;
  steps: StepRecord[];
  outcome?: Outcome;
}

/**
 * Accumulates step records for a single run and writes them (plus the
 * final outcome) to runs/<runId>/manifest.json -- the audit trail for a
 * tool that performs real, hard-to-fully-undo actions in production
 * Salesforce.
 */
export class RunRecorder {
  private manifest: RunManifest;
  private runDir: string;

  constructor(runId: string, runDir: string, input: AddProjectInput, dryRun: boolean) {
    this.runDir = runDir;
    this.manifest = { runId, dryRun, input, steps: [] };
  }

  addStep(step: StepRecord) {
    this.manifest.steps.push(step);
  }

  setOutcome(outcome: Outcome) {
    this.manifest.outcome = outcome;
  }

  async flush(): Promise<string> {
    const path = join(this.runDir, "manifest.json");
    await writeFile(path, JSON.stringify(this.manifest, null, 2), "utf-8");
    return path;
  }

  get current(): Readonly<RunManifest> {
    return this.manifest;
  }
}
