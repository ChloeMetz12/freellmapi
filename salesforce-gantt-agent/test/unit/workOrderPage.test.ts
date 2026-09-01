import { describe, expect, it, vi } from "vitest";
import { WorkOrderPage } from "../../src/salesforce/WorkOrderPage.js";
import { RunRecorder } from "../../src/logging/runRecorder.js";
import type { RunContext } from "../../src/types.js";
import type { ResolvedWorkOrder } from "../../src/schema/workOrder.js";

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

const fields: ResolvedWorkOrder = {
  projectIdentifier: "Daryl Van Horn",
  projectRecordUrl: "https://x.my.salesforce.com/project/001",
  owner: "Andrew Metz",
  dispatcher: "Andrew Metz",
  workOrderType: "SolarEdge Backup",
  includeBattery: true,
  includeInstall: false,
  serviceTerritory: "Richmond Install",
  serviceDate: "2026-09-15",
  description: "Install job",
};

describe("WorkOrderPage.open", () => {
  it("does not navigate for a dry-run:// URL", async () => {
    const goto = vi.fn();
    const ctx = fakeCtx(false, { goto });
    await new WorkOrderPage(ctx).open("dry-run://no-work-order-created");
    expect(goto).not.toHaveBeenCalled();
  });

  it("navigates to a real URL", async () => {
    const goto = vi.fn().mockResolvedValue(undefined);
    const ctx = fakeCtx(false, { goto });
    await new WorkOrderPage(ctx).open("https://x.my.salesforce.com/wo/001");
    expect(goto).toHaveBeenCalledWith("https://x.my.salesforce.com/wo/001");
  });
});

describe("WorkOrderPage.fillAndSave", () => {
  it("skips all field-filling in dry-run mode and records the fields as the step detail", async () => {
    const getByLabel = vi.fn();
    const ctx = fakeCtx(true, { getByLabel });
    const recorder = fakeRecorder();

    await new WorkOrderPage(ctx).fillAndSave(fields, recorder);

    expect(getByLabel).not.toHaveBeenCalled();
    expect(recorder.current.steps[0]).toMatchObject({ step: "fill-work-order-fields", outcome: "skipped-dry-run" });
    expect(recorder.current.steps[0].detail).toEqual(fields);
  });

  it("fills every field (including only the checked sub-option checkbox) and saves in live mode", async () => {
    const fillsByLabel = new Map<string, ReturnType<typeof vi.fn>>();
    const checksByLabel = new Map<string, ReturnType<typeof vi.fn>>();
    const getByLabel = vi.fn((label: string) => {
      const fill = vi.fn();
      const check = vi.fn();
      fillsByLabel.set(label, fill);
      checksByLabel.set(label, check);
      return { fill, check };
    });
    const saveClick = vi.fn();
    const getByRole = vi.fn().mockReturnValue({ click: saveClick });
    const waitForLoadState = vi.fn().mockResolvedValue(undefined);
    const ctx = fakeCtx(false, { getByLabel, getByRole, waitForLoadState });
    const recorder = fakeRecorder();

    await new WorkOrderPage(ctx).fillAndSave(fields, recorder);

    expect(fillsByLabel.get("Owner")).toHaveBeenCalledWith("Andrew Metz");
    expect(fillsByLabel.get("Dispatcher")).toHaveBeenCalledWith("Andrew Metz");
    expect(fillsByLabel.get("Work Order Type")).toHaveBeenCalledWith("SolarEdge Backup");
    expect(checksByLabel.get("Include Battery")).toHaveBeenCalledOnce();
    expect(getByLabel).not.toHaveBeenCalledWith("Include Install");
    expect(fillsByLabel.get("Service Territory")).toHaveBeenCalledWith("Richmond Install");
    expect(fillsByLabel.get("Service Date")).toHaveBeenCalledWith("2026-09-15");
    expect(fillsByLabel.get("Description")).toHaveBeenCalledWith("Install job");
    expect(saveClick).toHaveBeenCalledOnce();
    expect(waitForLoadState).toHaveBeenCalledWith("networkidle");
    expect(recorder.current.steps[0].outcome).toBe("ok");
  });
});

describe("WorkOrderPage.getServiceAppointmentUrl", () => {
  it("returns a placeholder without touching the page in dry-run mode", async () => {
    const getByRole = vi.fn();
    const ctx = fakeCtx(true, { getByRole });

    const url = await new WorkOrderPage(ctx).getServiceAppointmentUrl();

    expect(url).toBe("dry-run://no-service-appointment-created");
    expect(getByRole).not.toHaveBeenCalled();
  });

  it("resolves the auto-created Service Appointment link against the current page URL", async () => {
    const getAttribute = vi.fn().mockResolvedValue("/sa/002");
    const getByRole = vi.fn().mockReturnValue({ first: () => ({ getAttribute }) });
    const ctx = fakeCtx(false, { getByRole, url: () => "https://x.my.salesforce.com/wo/001" });

    const url = await new WorkOrderPage(ctx).getServiceAppointmentUrl();

    expect(url).toBe("https://x.my.salesforce.com/sa/002");
  });

  it("throws a clear error when no Service Appointment link is found", async () => {
    const getAttribute = vi.fn().mockResolvedValue(null);
    const getByRole = vi.fn().mockReturnValue({ first: () => ({ getAttribute }) });
    const ctx = fakeCtx(false, { getByRole, url: () => "https://x.my.salesforce.com/wo/001" });

    await expect(new WorkOrderPage(ctx).getServiceAppointmentUrl()).rejects.toThrow(/Could not find/i);
  });
});
