import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { putPendingRun, takePendingRun, type PendingRun } from "../../src/workflow/pendingRuns.js";
import type { RunContext } from "../../src/types.js";
import type { AuthenticatedSession } from "../../src/auth/session.js";

function fakeRun(overrides: Partial<PendingRun> = {}): { run: PendingRun; close: ReturnType<typeof vi.fn>; error: ReturnType<typeof vi.fn> } {
  const close = vi.fn().mockResolvedValue(undefined);
  const error = vi.fn();
  const ctx = { page: {} as never, dryRun: false, runId: "test-run", runDir: "/tmp/does-not-matter", logger: { info: vi.fn(), error } } as unknown as RunContext;
  const session = { context: {} as never, close } as unknown as AuthenticatedSession;

  const run: PendingRun = {
    ctx,
    session,
    recorder: {} as never,
    serviceAppointmentUrl: "https://x.my.salesforce.com/sa",
    workOrderUrl: "https://x.my.salesforce.com/wo",
    proposedTechnician: "Jane Tech",
    resolvedWorkOrder: {} as never,
    ...overrides,
  };
  return { run, close, error };
}

describe("putPendingRun / takePendingRun", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("stores a run and returns it exactly once", () => {
    const { run } = fakeRun();
    putPendingRun("run-1", run);

    expect(takePendingRun("run-1")).toBe(run);
    expect(takePendingRun("run-1")).toBeUndefined();
  });

  it("returns undefined for a runId that was never stored", () => {
    expect(takePendingRun("never-existed")).toBeUndefined();
  });

  it("auto-expires and closes the session if never taken within the TTL", async () => {
    const { run, close, error } = fakeRun();
    putPendingRun("run-2", run);

    await vi.advanceTimersByTimeAsync(15 * 60 * 1000);

    expect(close).toHaveBeenCalledOnce();
    expect(error).toHaveBeenCalledOnce();
    expect(takePendingRun("run-2")).toBeUndefined();
  });

  it("does not close the session if confirm_dispatch already took the run before the TTL fires", async () => {
    const { run, close, error } = fakeRun();
    putPendingRun("run-3", run);

    expect(takePendingRun("run-3")).toBe(run);

    await vi.advanceTimersByTimeAsync(15 * 60 * 1000);

    expect(close).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
  });

});

describe("putPendingRun timer lifecycle", () => {
  it("unrefs the expiry timer so it can't keep a long-lived MCP server process alive", () => {
    const setTimeoutSpy = vi.spyOn(globalThis, "setTimeout");
    const { run } = fakeRun();

    putPendingRun("run-4", run);

    const timer = setTimeoutSpy.mock.results.at(-1)?.value as NodeJS.Timeout;
    expect(timer.hasRef()).toBe(false);

    setTimeoutSpy.mockRestore();
    clearTimeout(timer);
  });
});
