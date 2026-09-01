import type { Env } from "../config/env.js";
import type { Notifier } from "./notifier.js";
import { EmailNotifier } from "./emailNotifier.js";

export type { EscalationEvent, Notifier } from "./notifier.js";

/** v1 only supports email, sent to the user alone -- see notifier.ts for the pluggable interface. */
export function getNotifier(env: Env): Notifier {
  return new EmailNotifier(env);
}
