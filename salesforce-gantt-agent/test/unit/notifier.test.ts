import { describe, expect, it } from "vitest";
import { getNotifier } from "../../src/escalation/index.js";
import { EmailNotifier } from "../../src/escalation/emailNotifier.js";
import type { Env } from "../../src/config/env.js";

const env = { SF_USER_DISPLAY_NAME: "Andrew Metz" } as Env;

describe("getNotifier", () => {
  it("returns an EmailNotifier (v1 only supports email, to the user alone)", () => {
    expect(getNotifier(env)).toBeInstanceOf(EmailNotifier);
  });
});

describe("EmailNotifier", () => {
  it("throws a clear, non-crashing error when escalation email isn't fully configured", async () => {
    const notifier = new EmailNotifier(env);
    await expect(
      notifier.notify({
        projectIdentifier: "Daryl Van Horn",
        reason: "no-candidates",
        workOrderUrl: "https://x.my.salesforce.com/wo",
        serviceAppointmentUrl: "https://x.my.salesforce.com/sa",
        runId: "test-run",
      }),
    ).rejects.toThrow(/not fully configured/i);
  });
});
