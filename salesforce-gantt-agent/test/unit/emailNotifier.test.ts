import { describe, expect, it, vi, beforeEach } from "vitest";
import type { Env } from "../../src/config/env.js";

const sendMail = vi.fn();
const createTransport = vi.fn(() => ({ sendMail }));

vi.mock("nodemailer", () => ({
  default: { createTransport },
}));

const { EmailNotifier } = await import("../../src/escalation/emailNotifier.js");

const configuredEnv = {
  SF_ORG_URL: "https://myorg.my.salesforce.com",
  SF_AUTH_STATE_PATH: "./auth/storageState.json",
  SF_USER_DISPLAY_NAME: "Andrew Metz",
  MODE: "dry-run",
  ESCALATION_EMAIL_TO: "andrew@example.com",
  ESCALATION_EMAIL_FROM: "gantt-agent@example.com",
  SMTP_HOST: "smtp.example.com",
  SMTP_PORT: 587,
  SMTP_USER: "smtpuser",
  SMTP_PASS: "smtppass",
  VIRTUAL_DISPLAY_WIDTH: 1440,
  VIRTUAL_DISPLAY_HEIGHT: 900,
  DRY_RUN_GET_CANDIDATES_RESULT: "ranked",
} as Env;

const event = {
  projectIdentifier: "Daryl Van Horn",
  reason: "no-candidates" as const,
  workOrderUrl: "https://myorg.my.salesforce.com/wo/001",
  serviceAppointmentUrl: "https://myorg.my.salesforce.com/sa/002",
  runId: "2026-08-31T00-00-00-000Z-ab12cd",
};

describe("EmailNotifier.notify (fully configured)", () => {
  beforeEach(() => {
    sendMail.mockReset().mockResolvedValue(undefined);
    createTransport.mockClear();
  });

  it("builds the SMTP transport from env config", async () => {
    await new EmailNotifier(configuredEnv).notify(event);

    expect(createTransport).toHaveBeenCalledWith({
      host: "smtp.example.com",
      port: 587,
      auth: { user: "smtpuser", pass: "smtppass" },
    });
  });

  it("sends to ESCALATION_EMAIL_TO from ESCALATION_EMAIL_FROM with the project name in the subject", async () => {
    await new EmailNotifier(configuredEnv).notify(event);

    expect(sendMail).toHaveBeenCalledOnce();
    const mail = sendMail.mock.calls[0][0];
    expect(mail.from).toBe("gantt-agent@example.com");
    expect(mail.to).toBe("andrew@example.com");
    expect(mail.subject).toContain("Daryl Van Horn");
  });

  it("includes the Work Order/Service Appointment links and run id in the body", async () => {
    await new EmailNotifier(configuredEnv).notify(event);

    const mail = sendMail.mock.calls[0][0];
    expect(mail.text).toContain(event.workOrderUrl);
    expect(mail.text).toContain(event.serviceAppointmentUrl);
    expect(mail.text).toContain(event.runId);
    expect(mail.text).toContain("no-candidates");
  });

  it("resolves when sendMail succeeds", async () => {
    await expect(new EmailNotifier(configuredEnv).notify(event)).resolves.toBeUndefined();
  });

  it("propagates the error when sendMail fails, rather than swallowing it", async () => {
    sendMail.mockRejectedValue(new Error("SMTP connection refused"));
    await expect(new EmailNotifier(configuredEnv).notify(event)).rejects.toThrow("SMTP connection refused");
  });

  it("throws a clear 'not configured' error and never touches nodemailer when SMTP config is incomplete", async () => {
    const incomplete = { ...configuredEnv, SMTP_PASS: undefined } as Env;
    await expect(new EmailNotifier(incomplete).notify(event)).rejects.toThrow(/not fully configured/i);
    expect(createTransport).not.toHaveBeenCalled();
  });
});
