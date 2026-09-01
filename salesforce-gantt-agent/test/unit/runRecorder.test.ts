import { describe, expect, it, afterEach } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { RunRecorder } from "../../src/logging/runRecorder.js";
import type { AddProjectInput } from "../../src/schema/input.js";
import type { Outcome } from "../../src/workflow/outcomes.js";

const input = { projectIdentifier: "Daryl Van Horn", dryRun: true } as AddProjectInput;

const tempDirs: string[] = [];

async function makeRunDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "run-recorder-test-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("RunRecorder", () => {
  it("starts with no steps and no outcome", async () => {
    const runDir = await makeRunDir();
    const recorder = new RunRecorder("run-1", runDir, input, true);

    expect(recorder.current.runId).toBe("run-1");
    expect(recorder.current.dryRun).toBe(true);
    expect(recorder.current.input).toEqual(input);
    expect(recorder.current.steps).toEqual([]);
    expect(recorder.current.outcome).toBeUndefined();
  });

  it("accumulates steps in the order they're added", async () => {
    const runDir = await makeRunDir();
    const recorder = new RunRecorder("run-2", runDir, input, true);

    recorder.addStep({ step: "open-project", startedAt: "t0", finishedAt: "t1", outcome: "ok" });
    recorder.addStep({ step: "save-work-order", startedAt: "t1", finishedAt: "t2", outcome: "skipped-dry-run" });

    expect(recorder.current.steps).toHaveLength(2);
    expect(recorder.current.steps.map((s) => s.step)).toEqual(["open-project", "save-work-order"]);
  });

  it("records the final outcome", async () => {
    const runDir = await makeRunDir();
    const recorder = new RunRecorder("run-3", runDir, input, true);
    const outcome: Outcome = { type: "Cancelled", runId: "run-3" };

    recorder.setOutcome(outcome);

    expect(recorder.current.outcome).toEqual(outcome);
  });

  it("flushes the full manifest to <runDir>/manifest.json", async () => {
    const runDir = await makeRunDir();
    const recorder = new RunRecorder("run-4", runDir, input, false);
    recorder.addStep({ step: "open-project", startedAt: "t0", finishedAt: "t1", outcome: "ok", screenshot: "open-project.png" });
    recorder.setOutcome({ type: "Cancelled", runId: "run-4" });

    const path = await recorder.flush();

    expect(path).toBe(join(runDir, "manifest.json"));
    const written = JSON.parse(await readFile(path, "utf-8"));
    expect(written).toEqual({
      runId: "run-4",
      dryRun: false,
      input,
      steps: [{ step: "open-project", startedAt: "t0", finishedAt: "t1", outcome: "ok", screenshot: "open-project.png" }],
      outcome: { type: "Cancelled", runId: "run-4" },
    });
  });

  it("overwrites the manifest file on a second flush (e.g. after a later step/outcome)", async () => {
    const runDir = await makeRunDir();
    const recorder = new RunRecorder("run-5", runDir, input, true);
    recorder.addStep({ step: "open-project", startedAt: "t0", finishedAt: "t1", outcome: "ok" });
    await recorder.flush();

    recorder.setOutcome({ type: "Cancelled", runId: "run-5" });
    const path = await recorder.flush();

    const written = JSON.parse(await readFile(path, "utf-8"));
    expect(written.outcome).toEqual({ type: "Cancelled", runId: "run-5" });
    expect(written.steps).toHaveLength(1);
  });

  it("current returns a live view, not a snapshot frozen at construction", async () => {
    const runDir = await makeRunDir();
    const recorder = new RunRecorder("run-6", runDir, input, true);
    const before = recorder.current;

    recorder.addStep({ step: "open-project", startedAt: "t0", finishedAt: "t1", outcome: "ok" });

    expect(before.steps).toHaveLength(1);
  });
});
