import { describe, expect, it, vi } from "vitest";
import { DispatchConsolePage } from "../../src/salesforce/DispatchConsolePage.js";
import { RunRecorder } from "../../src/logging/runRecorder.js";
import type { RunContext } from "../../src/types.js";

vi.mock("../../src/logging/screenshots.js", () => ({
  captureScreenshot: vi.fn().mockResolvedValue("fake-screenshot.png"),
}));

function fakeCtx(dryRun: boolean, page: unknown = {}): RunContext {
  return {
    page: page as never,
    dryRun,
    runId: "test-run",
    runDir: "/tmp/does-not-matter",
    logger: { info: vi.fn(), error: vi.fn() } as never,
  };
}

function fakeRecorder() {
  return new RunRecorder("test-run", "/tmp/does-not-matter", { projectIdentifier: "x", dryRun: true }, true);
}

describe("DispatchConsolePage.setDispatched", () => {
  it("never navigates for a dry-run:// URL and records a skipped-dry-run step", async () => {
    const goto = vi.fn();
    const ctx = fakeCtx(true, { goto, click: vi.fn(), getByRole: vi.fn(), reload: vi.fn(), getByText: vi.fn() });
    const recorder = fakeRecorder();

    await new DispatchConsolePage(ctx).setDispatched("dry-run://no-appointment", recorder);

    expect(goto).not.toHaveBeenCalled();
    expect(recorder.current.steps).toHaveLength(1);
    expect(recorder.current.steps[0]).toMatchObject({ step: "set-dispatched", outcome: "skipped-dry-run" });
    expect(recorder.current.steps[0].detail).toEqual({ serviceAppointmentUrl: "dry-run://no-appointment" });
  });

  it("navigates to a real URL even in dry-run mode, but never right-clicks/changes status (guarded)", async () => {
    const goto = vi.fn().mockResolvedValue(undefined);
    const click = vi.fn();
    const ctx = fakeCtx(true, { goto, click, getByRole: vi.fn(), reload: vi.fn(), getByText: vi.fn() });
    const recorder = fakeRecorder();

    await new DispatchConsolePage(ctx).setDispatched("https://x.my.salesforce.com/sa/002", recorder);

    expect(goto).toHaveBeenCalledWith("https://x.my.salesforce.com/sa/002");
    expect(click).not.toHaveBeenCalled();
    expect(recorder.current.steps[0].outcome).toBe("skipped-dry-run");
  });

  it("right-clicks, selects Dispatched, reloads, and waits for the status badge in live mode", async () => {
    const click = vi.fn();
    const menuItemClick = vi.fn();
    const reload = vi.fn().mockResolvedValue(undefined);
    const waitFor = vi.fn().mockResolvedValue(undefined);
    const getByRole = vi.fn().mockReturnValue({ click: menuItemClick });
    const getByText = vi.fn().mockReturnValue({ waitFor });
    const ctx = fakeCtx(false, {
      goto: vi.fn().mockResolvedValue(undefined),
      click,
      getByRole,
      reload,
      getByText,
    });
    const recorder = fakeRecorder();

    await new DispatchConsolePage(ctx).setDispatched("https://x.my.salesforce.com/sa/002", recorder);

    expect(click).toHaveBeenCalledWith("body", { button: "right" });
    expect(menuItemClick).toHaveBeenCalledOnce();
    expect(reload).toHaveBeenCalledOnce();
    expect(getByText).toHaveBeenCalledWith("Dispatched", { exact: false });
    expect(waitFor).toHaveBeenCalledWith({ state: "visible", timeout: 10000 });
    expect(recorder.current.steps[0].outcome).toBe("ok");
  });
});
