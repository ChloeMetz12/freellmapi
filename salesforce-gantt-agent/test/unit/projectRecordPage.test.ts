import { describe, expect, it, vi } from "vitest";
import { ProjectRecordPage } from "../../src/salesforce/ProjectRecordPage.js";
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

describe("ProjectRecordPage.open", () => {
  it("navigates via the deep search link and clicks the matching result when the org supports it", async () => {
    const resultClick = vi.fn();
    const goto = vi.fn().mockResolvedValue(undefined);
    const getByText = vi.fn().mockReturnValue({ first: () => ({ click: resultClick }) });
    const getByRole = vi.fn();
    const ctx = fakeCtx(false, { goto, getByText, getByRole, url: () => "https://x.my.salesforce.com/" });

    await new ProjectRecordPage(ctx).open("Daryl Van Horn");

    expect(goto).toHaveBeenCalledOnce();
    expect(String(goto.mock.calls[0][0])).toContain("Daryl%20Van%20Horn");
    expect(getByRole).not.toHaveBeenCalled();
    expect(getByText).toHaveBeenCalledWith("Daryl Van Horn", { exact: false });
    expect(resultClick).toHaveBeenCalledOnce();
  });

  it("falls back to the global search box when the deep search link fails, then still clicks the matching result", async () => {
    const resultClick = vi.fn();
    const searchboxFill = vi.fn();
    const keyboardPress = vi.fn();
    const goto = vi.fn().mockRejectedValue(new Error("no route for this URL"));
    const getByText = vi.fn().mockReturnValue({ first: () => ({ click: resultClick }) });
    const getByRole = vi.fn().mockReturnValue({ first: () => ({ fill: searchboxFill }) });
    const ctx = fakeCtx(false, {
      goto,
      getByText,
      getByRole,
      keyboard: { press: keyboardPress },
      url: () => "https://x.my.salesforce.com/",
    });

    await new ProjectRecordPage(ctx).open("Daryl Van Horn");

    expect(getByRole).toHaveBeenCalledWith("searchbox");
    expect(searchboxFill).toHaveBeenCalledWith("Daryl Van Horn");
    expect(keyboardPress).toHaveBeenCalledWith("Enter");
    expect(resultClick).toHaveBeenCalledOnce();
  });
});

describe("ProjectRecordPage.extractFields", () => {
  it("returns the current page URL plus trimmed field values", async () => {
    const getByLabel = vi.fn((label: string) => ({
      first: () => ({
        textContent: async () => (label === "Installation Scheduled" ? "  09/15/2026  " : "  Install job  "),
      }),
    }));
    const ctx = fakeCtx(false, { getByLabel, url: () => "https://x.my.salesforce.com/project/001" });

    const result = await new ProjectRecordPage(ctx).extractFields();

    expect(result).toEqual({
      recordUrl: "https://x.my.salesforce.com/project/001",
      installScheduledDate: "09/15/2026",
      description: "Install job",
    });
  });

  it("returns undefined (not empty string) for blank or missing fields", async () => {
    const getByLabel = vi.fn(() => ({
      first: () => ({ textContent: async () => "   " }),
    }));
    const ctx = fakeCtx(false, { getByLabel, url: () => "https://x.my.salesforce.com/project/001" });

    const result = await new ProjectRecordPage(ctx).extractFields();

    expect(result.installScheduledDate).toBeUndefined();
    expect(result.description).toBeUndefined();
  });

  it("returns undefined instead of throwing when a field's locator can't be found at all", async () => {
    const getByLabel = vi.fn(() => ({
      first: () => ({ textContent: async () => Promise.reject(new Error("not found")) }),
    }));
    const ctx = fakeCtx(false, { getByLabel, url: () => "https://x.my.salesforce.com/project/001" });

    const result = await new ProjectRecordPage(ctx).extractFields();

    expect(result.installScheduledDate).toBeUndefined();
    expect(result.description).toBeUndefined();
  });
});

describe("ProjectRecordPage.createInstallWorkOrder", () => {
  it("skips the click sequence in dry-run mode and returns the placeholder URL", async () => {
    const getByRole = vi.fn();
    const ctx = fakeCtx(true, { getByRole, url: () => "https://x.my.salesforce.com/project/001" });
    const recorder = fakeRecorder();

    const url = await new ProjectRecordPage(ctx).createInstallWorkOrder(recorder);

    expect(url).toBe("dry-run://no-work-order-created");
    expect(getByRole).not.toHaveBeenCalled();
    expect(recorder.current.steps[0]).toMatchObject({ step: "create-install-work-order", outcome: "skipped-dry-run" });
  });

  it("clicks Install Work Order -> New -> Save and returns the resulting URL in live mode", async () => {
    const installClick = vi.fn();
    const newOptionClick = vi.fn();
    const saveClick = vi.fn();
    const getByRole = vi.fn((role: string, opts?: { name?: unknown }) => {
      const name = opts?.name ? String(opts.name) : "";
      if (role === "button" && name === "Install Work Order") return { click: installClick };
      if (role === "option" && name === "New") return { click: newOptionClick };
      if (role === "button" && name === "Save") return { click: saveClick };
      throw new Error(`Unexpected getByRole call: ${role} / ${name}`);
    });
    const waitForLoadState = vi.fn().mockResolvedValue(undefined);
    const ctx = fakeCtx(false, {
      getByRole,
      waitForLoadState,
      url: () => "https://x.my.salesforce.com/wo/001",
    });
    const recorder = fakeRecorder();

    const url = await new ProjectRecordPage(ctx).createInstallWorkOrder(recorder);

    expect(installClick).toHaveBeenCalledOnce();
    expect(newOptionClick).toHaveBeenCalledOnce();
    expect(saveClick).toHaveBeenCalledOnce();
    expect(waitForLoadState).toHaveBeenCalledWith("networkidle");
    expect(url).toBe("https://x.my.salesforce.com/wo/001");
    expect(recorder.current.steps[0].outcome).toBe("ok");
  });
});
