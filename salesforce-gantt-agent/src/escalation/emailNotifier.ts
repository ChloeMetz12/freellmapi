import nodemailer from "nodemailer";
import type { Env } from "../config/env.js";
import { escalationEmailConfigured } from "../config/env.js";
import type { EscalationEvent, Notifier } from "./notifier.js";

/**
 * Sends a "needs manual assignment" alert by email, to the user only (no
 * Slack, no other recipients, per the user's explicit choice for v1).
 * Recipient/sender/SMTP config all come from env -- never hardcoded.
 */
export class EmailNotifier implements Notifier {
  constructor(private env: Env) {}

  async notify(event: EscalationEvent): Promise<void> {
    if (!escalationEmailConfigured(this.env)) {
      throw new Error(
        "Escalation email is not fully configured (ESCALATION_EMAIL_TO/FROM, SMTP_HOST/USER/PASS) -- " +
          "see .env.example. The run will still be flagged as NeedsManualAssignment; only the email failed.",
      );
    }

    const transport = nodemailer.createTransport({
      host: this.env.SMTP_HOST,
      port: this.env.SMTP_PORT,
      auth: { user: this.env.SMTP_USER, pass: this.env.SMTP_PASS },
    });

    await transport.sendMail({
      from: this.env.ESCALATION_EMAIL_FROM,
      to: this.env.ESCALATION_EMAIL_TO,
      subject: `[Gantt Agent] Needs manual assignment: ${event.projectIdentifier}`,
      text: [
        `Project: ${event.projectIdentifier}`,
        `Reason: ${event.reason}`,
        `Work Order: ${event.workOrderUrl}`,
        `Service Appointment: ${event.serviceAppointmentUrl}`,
        `Run: ${event.runId}`,
        "",
        "Get Candidates could not find/assign a technician automatically. Please schedule this manually via drag-and-drop on the Classic Dispatch Console.",
      ].join("\n"),
    });
  }
}
