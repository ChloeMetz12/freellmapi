import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  SF_ORG_URL: z.string().url({ message: "SF_ORG_URL must be a valid Salesforce org URL" }),
  SF_AUTH_STATE_PATH: z.string().default("./auth/storageState.json"),
  /** Used as the Work Order's Owner/Dispatcher -- the logged-in user, per the training transcript. */
  SF_USER_DISPLAY_NAME: z.string().min(1, "SF_USER_DISPLAY_NAME is required (used as Work Order Owner/Dispatcher)"),
  MODE: z.enum(["dry-run", "live"]).default("dry-run"),
  ESCALATION_EMAIL_TO: z.string().email().optional(),
  ESCALATION_EMAIL_FROM: z.string().email().optional(),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().positive().default(587),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  VIRTUAL_DISPLAY_WIDTH: z.coerce.number().int().positive().default(1440),
  VIRTUAL_DISPLAY_HEIGHT: z.coerce.number().int().positive().default(900),
});

export type Env = z.infer<typeof envSchema>;

let cached: Env | undefined;

/**
 * Loads and validates process.env once per process. Fails fast (throws) on
 * startup rather than surfacing a confusing error mid-Salesforce-automation
 * when a required var turns out to be missing.
 */
export function loadEnv(): Env {
  if (cached) return cached;
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Invalid environment configuration:\n${issues}\n\nCopy .env.example to .env and fill it in.`);
  }
  cached = parsed.data;
  return cached;
}

/** Whether escalation email is fully configured (all-or-nothing). */
export function escalationEmailConfigured(env: Env): boolean {
  return Boolean(env.ESCALATION_EMAIL_TO && env.ESCALATION_EMAIL_FROM && env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASS);
}
