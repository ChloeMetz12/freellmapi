import { describe, expect, it, vi, beforeEach } from "vitest";
import type { PendingConfirmationOutcome } from "../../src/workflow/outcomes.js";

const question = vi.fn();
const close = vi.fn();

vi.mock("node:readline/promises", () => ({
  default: {
    createInterface: vi.fn(() => ({ question, close })),
  },
}));

const { confirmDispatchInteractively } = await import("../../src/safety/confirm.js");

function pending(overrides: Partial<PendingConfirmationOutcome> = {}): PendingConfirmationOutcome {
  return {
    type: "PendingConfirmation",
    runId: "test-run",
    proposedTechnician: "Jane Tech",
    workOrderUrl: "https://x.my.salesforce.com/wo",
    serviceAppointmentUrl: "https://x.my.salesforce.com/sa",
    resolvedWorkOrder: { serviceDate: "2026-09-15" } as never,
    ...overrides,
  };
}

describe("confirmDispatchInteractively", () => {
  beforeEach(() => {
    question.mockReset();
    close.mockReset();
  });

  it.each(["y", "Y", "yes", "YES", "  yes  "])("treats %j as approval", async (answer) => {
    question.mockResolvedValue(answer);
    await expect(confirmDispatchInteractively(pending())).resolves.toBe(true);
  });

  it.each(["n", "N", "no", "", "sure", "yesplease"])("treats %j as declining, not just anything-but-n", async (answer) => {
    question.mockResolvedValue(answer);
    await expect(confirmDispatchInteractively(pending())).resolves.toBe(false);
  });

  it("closes the readline interface even when the prompt resolves", async () => {
    question.mockResolvedValue("y");
    await confirmDispatchInteractively(pending());
    expect(close).toHaveBeenCalledOnce();
  });

  it("closes the readline interface even if the prompt rejects", async () => {
    question.mockRejectedValue(new Error("stdin closed"));
    await expect(confirmDispatchInteractively(pending())).rejects.toThrow("stdin closed");
    expect(close).toHaveBeenCalledOnce();
  });
});
