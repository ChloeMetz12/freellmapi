import { describe, expect, it } from "vitest";
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
