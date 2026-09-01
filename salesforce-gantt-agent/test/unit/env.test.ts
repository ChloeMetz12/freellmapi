import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { escalationEmailConfigured, type Env } from "../../src/config/env.js";

function baseEnv(overrides: Partial<Env> = {}): Env {
  return {
    SF_ORG_URL: "https://example.my.salesforce.com",
    SF_AUTH_STATE_PATH: "./auth/storageState.json",
    SF_USER_DISPLAY_NAME: "Andrew Metz",
    MODE: "dry-run",
    VIRTUAL_DISPLAY_WIDTH: 1440,
    VIRTUAL_DISPLAY_HEIGHT: 900,
    SMTP_PORT: 587,
    ...overrides,
  };
}

describe("escalationEmailConfigured", () => {
  it("is false when no escalation fields are set", () => {
    expect(escalationEmailConfigured(baseEnv())).toBe(false);
  });

  it("is false when only some escalation fields are set", () => {
    expect(
      escalationEmailConfigured(
        baseEnv({ ESCALATION_EMAIL_TO: "user@example.com", ESCALATION_EMAIL_FROM: "agent@example.com" }),
      ),
    ).toBe(false);
  });

  it("is true only when every escalation field is set", () => {
    expect(
      escalationEmailConfigured(
        baseEnv({
          ESCALATION_EMAIL_TO: "user@example.com",
          ESCALATION_EMAIL_FROM: "agent@example.com",
          SMTP_HOST: "smtp.example.com",
          SMTP_USER: "user",
          SMTP_PASS: "pass",
        }),
      ),
    ).toBe(true);
  });
});

describe("loadEnv", () => {
  const originalEnv = { ...process.env };
  // Vitest itself sets process.env.MODE="test" -- override it so it doesn't
  // trip envSchema's dry-run/live enum.
  const required = { SF_ORG_URL: "https://example.my.salesforce.com", SF_USER_DISPLAY_NAME: "Andrew Metz", MODE: "dry-run" };

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("does not throw when escalation email vars are blank -- the documented .env.example default", async () => {
    Object.assign(process.env, required, { ESCALATION_EMAIL_TO: "", ESCALATION_EMAIL_FROM: "" });
    const { loadEnv } = await import("../../src/config/env.js");

    const env = loadEnv();

    expect(env.ESCALATION_EMAIL_TO).toBeUndefined();
    expect(env.ESCALATION_EMAIL_FROM).toBeUndefined();
  });

  it("still rejects a genuinely malformed escalation email", async () => {
    Object.assign(process.env, required, { ESCALATION_EMAIL_TO: "not-an-email" });
    const { loadEnv } = await import("../../src/config/env.js");

    expect(() => loadEnv()).toThrow(/invalid email/i);
  });
});
