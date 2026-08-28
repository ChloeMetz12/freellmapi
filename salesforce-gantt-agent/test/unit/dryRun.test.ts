import { describe, expect, it, vi } from "vitest";
import { guardedAction } from "../../src/safety/dryRun.js";
import { RunRecorder } from "../../src/logging/runRecorder.js";
import type { RunContext } from "../../src/types.js";

vi.mock("../../src/logging/screenshots.js", () => ({
  captureScreenshot: vi.fn().mockResolvedValue("fake-screenshot.png"),
}));

function fakeCtx(dryRun: boolean): RunContext {
  return {
    page: {} as never,
    dryRun,
    runId: "test-run",
    runDir: "/tmp/does-not-matter",
    logger: { info: vi.fn(), error: vi.fn() } as never,
  };
}

describe("guardedAction", () => {
  it("does NOT call the real action in dry-run mode, and returns the provided dryRunResult", async () => {
    const ctx = fakeCtx(true);
    const recorder = new RunRecorder("test-run", "/tmp/does-not-matter", { projectIdentifier: "x", dryRun: true }, true);
    const action = vi.fn().mockResolvedValue("real-result");

    const result = await guardedAction(ctx, recorder, "save-work-order", { some: "payload" }, action, "dry-run-result");

    expect(action).not.toHaveBeenCalled();
    expect(result).toBe("dry-run-result");
    expect(recorder.current.steps).toHaveLength(1);
    expect(recorder.current.steps[0].outcome).toBe("skipped-dry-run");
  });

  it("calls the real action in live mode and records an ok step", async () => {
    const ctx = fakeCtx(false);
    const recorder = new RunRecorder("test-run", "/tmp/does-not-matter", { projectIdentifier: "x", dryRun: false }, false);
    const action = vi.fn().mockResolvedValue("real-result");

    const result = await guardedAction(ctx, recorder, "save-work-order", { some: "payload" }, action, "dry-run-result");

    expect(action).toHaveBeenCalledOnce();
    expect(result).toBe("real-result");
    expect(recorder.current.steps[0].outcome).toBe("ok");
  });

  it("records an error step and re-throws when the live action fails", async () => {
    const ctx = fakeCtx(false);
    const recorder = new RunRecorder("test-run", "/tmp/does-not-matter", { projectIdentifier: "x", dryRun: false }, false);
    const action = vi.fn().mockRejectedValue(new Error("Salesforce timed out"));

    await expect(guardedAction(ctx, recorder, "save-work-order", {}, action, undefined)).rejects.toThrow("Salesforce timed out");
    expect(recorder.current.steps[0].outcome).toBe("error");
  });
});
