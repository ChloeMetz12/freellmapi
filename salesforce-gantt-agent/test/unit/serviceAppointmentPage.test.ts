import { describe, expect, it, vi } from "vitest";
import { ServiceAppointmentPage } from "../../src/salesforce/ServiceAppointmentPage.js";
import { RunRecorder } from "../../src/logging/runRecorder.js";
import type { RunContext } from "../../src/types.js";

vi.mock("../../src/logging/screenshots.js", () => ({
  captureScreenshot: vi.fn().mockResolvedValue("fake-screenshot.png"),
}));

function fakeCtx(): RunContext {
  return {
    // getCandidates() short-circuits before touching the page in dry-run
    // mode, so an empty stub is enough here.
    page: {} as never,
    dryRun: true,
    runId: "test-run",
    runDir: "/tmp/does-not-matter",
    logger: { info: vi.fn(), error: vi.fn() } as never,
  };
}

describe("ServiceAppointmentPage.getCandidates in dry-run mode", () => {
  it("simulates a ranked result instead of no-candidates, so the workflow can reach Dispatched", async () => {
    const ctx = fakeCtx();
    const recorder = new RunRecorder("test-run", "/tmp/does-not-matter", { projectIdentifier: "x", dryRun: true }, true);
    const page = new ServiceAppointmentPage(ctx);

    const result = await page.getCandidates(recorder);

    expect(result.status).toBe("ranked");
    if (result.status === "ranked") {
      expect(result.topCandidate).toBeTruthy();
    }
  });
});
