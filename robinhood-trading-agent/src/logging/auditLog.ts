import { mkdirSync, appendFileSync } from "node:fs";
import { join } from "node:path";

export type AuditEventType = "decision" | "order" | "learning_update" | "halt" | "resume" | "sentiment";

export type AuditEventInput = { type: AuditEventType } & Record<string, unknown>;

/**
 * Append-only structured log — every decision (even ones that don't
 * trade), every order, every learning weight update, and every
 * halt/resume event, mirroring the audit-trail convention in
 * `salesforce-gantt-agent/logging/`. One file per UTC day so it stays
 * grep-able without growing unbounded.
 */
export class AuditLog {
  constructor(private readonly logDir: string) {
    mkdirSync(logDir, { recursive: true });
  }

  record(event: AuditEventInput): void {
    const timestamp = new Date().toISOString();
    const full = { ...event, timestamp };
    const fileName = `${timestamp.slice(0, 10)}.jsonl`;
    appendFileSync(join(this.logDir, fileName), JSON.stringify(full) + "\n");
  }
}
