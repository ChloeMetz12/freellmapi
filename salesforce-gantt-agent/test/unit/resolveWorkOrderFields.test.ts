import { describe, expect, it } from "vitest";
import { resolveWorkOrderFields } from "../../src/workflow/addProjectToGantt.js";
import type { AddProjectInput } from "../../src/schema/input.js";
import type { Env } from "../../src/config/env.js";

const env = { SF_USER_DISPLAY_NAME: "Andrew Metz" } as Env;

const baseInput: AddProjectInput = {
  projectIdentifier: "Daryl Van Horn",
  dryRun: true,
};

describe("resolveWorkOrderFields", () => {
  it("uses the env display name for both owner and dispatcher", () => {
    const resolved = resolveWorkOrderFields(baseInput, { recordUrl: "https://x.my.salesforce.com/001" }, env);
    expect(resolved.owner).toBe("Andrew Metz");
    expect(resolved.dispatcher).toBe("Andrew Metz");
  });

  it("prefers caller-supplied fields over extracted ones", () => {
    const resolved = resolveWorkOrderFields(
      { ...baseInput, description: "caller description", serviceDate: "2026-08-11" },
      { recordUrl: "https://x.my.salesforce.com/001", description: "extracted description", installScheduledDate: "2026-01-01" },
      env,
    );
    expect(resolved.description).toBe("caller description");
    expect(resolved.serviceDate).toBe("2026-08-11");
  });

  it("falls back to extracted fields when the caller didn't supply them", () => {
    const resolved = resolveWorkOrderFields(
      baseInput,
      { recordUrl: "https://x.my.salesforce.com/001", description: "extracted description", installScheduledDate: "2026-08-11" },
      env,
    );
    expect(resolved.description).toBe("extracted description");
    expect(resolved.serviceDate).toBe("2026-08-11");
  });

  it("leaves serviceDate undefined when neither the caller nor extraction provides a parseable date", () => {
    const resolved = resolveWorkOrderFields(baseInput, { recordUrl: "https://x.my.salesforce.com/001", installScheduledDate: "not a date" }, env);
    expect(resolved.serviceDate).toBeUndefined();
  });

  it("defaults includeBattery/includeInstall to false and description to empty string", () => {
    const resolved = resolveWorkOrderFields(baseInput, { recordUrl: "https://x.my.salesforce.com/001" }, env);
    expect(resolved.includeBattery).toBe(false);
    expect(resolved.includeInstall).toBe(false);
    expect(resolved.description).toBe("");
  });
});
