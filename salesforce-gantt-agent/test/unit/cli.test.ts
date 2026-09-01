import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import type { Outcome, PendingConfirmationOutcome } from "../../src/workflow/outcomes.js";

const loadEnv = vi.fn();
const addProjectToGantt = vi.fn();
const confirmDispatch = vi.fn();
const confirmDispatchInteractively = vi.fn();

vi.mock("../../src/config/env.js", () => ({ loadEnv }));
vi.mock("../../src/workflow/addProjectToGantt.js", () => ({ addProjectToGantt, confirmDispatch }));
vi.mock("../../src/safety/confirm.js", () => ({ confirmDispatchInteractively }));

const fakeEnv = { SF_ORG_URL: "https://x.my.salesforce.com" } as never;
const dispatched: Outcome = { type: "Dispatched", workOrderUrl: "https://x/wo", serviceAppointmentUrl: "https://x/sa", assignedTechnician: "Jane Tech" };

async function runCli(args: string[]) {
  vi.resetModules();
  process.argv = ["node", "salesforce-gantt-agent", ...args];
  await import("../../src/cli/index.js");
}

describe("CLI add-project", () => {
  beforeEach(() => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    loadEnv.mockReturnValue(fakeEnv);
    addProjectToGantt.mockReset().mockResolvedValue(dispatched);
    confirmDispatch.mockReset();
    confirmDispatchInteractively.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("resolves dryRun:false from --live", async () => {
    await runCli(["add-project", "--project", "Daryl Van Horn", "--live"]);
    await vi.waitFor(() => expect(addProjectToGantt).toHaveBeenCalled());

    expect(addProjectToGantt.mock.calls[0][0]).toMatchObject({ projectIdentifier: "Daryl Van Horn", dryRun: false });
    expect(addProjectToGantt.mock.calls[0][1]).toBe(fakeEnv);
  });

  it("defaults to dryRun:true when --live is not passed", async () => {
    await runCli(["add-project", "--project", "Daryl Van Horn"]);
    await vi.waitFor(() => expect(addProjectToGantt).toHaveBeenCalled());

    expect(addProjectToGantt.mock.calls[0][0]).toMatchObject({ dryRun: true });
  });

  it("passes through the optional work order fields", async () => {
    await runCli([
      "add-project",
      "--project",
      "Daryl Van Horn",
      "--work-order-type",
      "SolarEdge Backup",
      "--include-battery",
      "--service-territory",
      "Richmond Install",
      "--service-date",
      "2026-09-15",
      "--description",
      "Install job",
    ]);
    await vi.waitFor(() => expect(addProjectToGantt).toHaveBeenCalled());

    expect(addProjectToGantt.mock.calls[0][0]).toMatchObject({
      workOrderType: "SolarEdge Backup",
      includeBattery: true,
      includeInstall: false,
      serviceTerritory: "Richmond Install",
      serviceDate: "2026-09-15",
      description: "Install job",
    });
  });

  it("prompts interactively and resumes via confirmDispatch when the outcome is PendingConfirmation", async () => {
    const pending: PendingConfirmationOutcome = {
      type: "PendingConfirmation",
      runId: "run-1",
      proposedTechnician: "Jane Tech",
      workOrderUrl: "https://x/wo",
      serviceAppointmentUrl: "https://x/sa",
      resolvedWorkOrder: { serviceDate: "2026-09-15" } as never,
    };
    addProjectToGantt.mockResolvedValue(pending);
    confirmDispatchInteractively.mockResolvedValue(true);
    confirmDispatch.mockResolvedValue(dispatched);

    await runCli(["add-project", "--project", "Daryl Van Horn", "--live"]);
    await vi.waitFor(() => expect(confirmDispatch).toHaveBeenCalled());

    expect(confirmDispatchInteractively).toHaveBeenCalledWith(pending);
    expect(confirmDispatch).toHaveBeenCalledWith("run-1", true);
  });

  it("does not prompt or call confirmDispatch for a non-pending outcome", async () => {
    addProjectToGantt.mockResolvedValue({ type: "NeedsManualAssignment", reason: "no-candidates", workOrderUrl: "https://x/wo", serviceAppointmentUrl: "https://x/sa" });

    await runCli(["add-project", "--project", "Daryl Van Horn"]);
    await vi.waitFor(() => expect(addProjectToGantt).toHaveBeenCalled());
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(confirmDispatchInteractively).not.toHaveBeenCalled();
    expect(confirmDispatch).not.toHaveBeenCalled();
  });
});

describe("CLI confirm-dispatch", () => {
  beforeEach(() => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    confirmDispatch.mockReset().mockResolvedValue(dispatched);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("passes --approve through as true", async () => {
    await runCli(["confirm-dispatch", "--run-id", "run-1", "--approve"]);
    await vi.waitFor(() => expect(confirmDispatch).toHaveBeenCalled());

    expect(confirmDispatch).toHaveBeenCalledWith("run-1", true);
  });

  it("defaults --approve to false when omitted", async () => {
    await runCli(["confirm-dispatch", "--run-id", "run-1"]);
    await vi.waitFor(() => expect(confirmDispatch).toHaveBeenCalled());

    expect(confirmDispatch).toHaveBeenCalledWith("run-1", false);
  });
});
