import { describe, expect, it, vi } from "vitest";
import type { Env } from "../../src/config/env.js";

vi.mock("../../src/logging/screenshots.js", () => ({
  captureScreenshot: vi.fn().mockResolvedValue("fake-screenshot.png"),
}));

vi.mock("../../src/logging/logger.js", () => ({
  generateRunId: () => "test-run-id",
  createRunLogger: () => ({ info: vi.fn(), error: vi.fn() }),
}));

vi.mock("../../src/logging/runRecorder.js", () => {
  class RunRecorder {
    private outcome: unknown;
    addStep = vi.fn();
    setOutcome(outcome: unknown) {
      this.outcome = outcome;
    }
    flush = vi.fn().mockResolvedValue("fake-manifest-path");
    get current() {
      return { outcome: this.outcome, steps: [] };
    }
  }
  return { RunRecorder };
});

const closeSession = vi.fn().mockResolvedValue(undefined);
vi.mock("../../src/auth/session.js", () => ({
  openAuthenticatedSession: vi.fn().mockResolvedValue({
    context: {
      newPage: vi.fn().mockResolvedValue({
        goto: vi.fn().mockResolvedValue(undefined),
        screenshot: vi.fn().mockResolvedValue(undefined),
      }),
    },
    close: closeSession,
  }),
  SessionExpiredError: class SessionExpiredError extends Error {},
}));

vi.mock("../../src/salesforce/ProjectRecordPage.js", () => ({
  ProjectRecordPage: vi.fn().mockImplementation(() => ({
    open: vi.fn().mockResolvedValue(undefined),
    extractFields: vi.fn().mockResolvedValue({
      recordUrl: "https://example.my.salesforce.com/lightning/r/Project__c/001/view",
      installScheduledDate: "2026-09-01",
      description: "Scraped description",
    }),
    createInstallWorkOrder: vi.fn().mockResolvedValue("https://example.my.salesforce.com/lightning/r/WorkOrder/002/view"),
  })),
}));

vi.mock("../../src/salesforce/WorkOrderPage.js", () => ({
  WorkOrderPage: vi.fn().mockImplementation(() => ({
    open: vi.fn().mockResolvedValue(undefined),
    fillAndSave: vi.fn().mockResolvedValue(undefined),
    getServiceAppointmentUrl: vi.fn().mockResolvedValue("dry-run://no-service-appointment-created"),
  })),
}));

// ServiceAppointmentPage is intentionally NOT mocked: this test exercises the
// real class (and the real guardedAction choke point) in dry-run mode, to
// prove the workflow can actually reach a "ranked"/Dispatched outcome instead
// of always falling into NeedsManualAssignment.

function testEnv(): Env {
  return {
    SF_ORG_URL: "https://example.my.salesforce.com",
    SF_AUTH_STATE_PATH: "./auth/storageState.json",
    SF_USER_DISPLAY_NAME: "Andrew Metz",
    MODE: "dry-run",
    VIRTUAL_DISPLAY_WIDTH: 1440,
    VIRTUAL_DISPLAY_HEIGHT: 900,
    SMTP_PORT: 587,
  };
}

describe("addProjectToGantt in dry-run mode", () => {
  it("reaches a Dispatched outcome (not NeedsManualAssignment) when Get Candidates would succeed", async () => {
    const { addProjectToGantt } = await import("../../src/workflow/addProjectToGantt.js");

    const outcome = await addProjectToGantt(
      {
        projectIdentifier: "Test Project",
        workOrderType: "SolarEdge Backup",
        includeBattery: false,
        includeInstall: false,
        serviceTerritory: "Richmond Install",
        serviceDate: "2026-09-01",
        description: "test",
        dryRun: true,
      },
      testEnv(),
    );

    expect(outcome.type).toBe("Dispatched");
    if (outcome.type === "Dispatched") {
      expect(outcome.assignedTechnician).toBeTruthy();
    }
    expect(closeSession).toHaveBeenCalled();
  });
});
