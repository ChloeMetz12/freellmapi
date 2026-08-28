import { describe, expect, it } from "vitest";
import { addProjectInputSchema, confirmDispatchInputSchema } from "../../src/schema/input.js";

describe("addProjectInputSchema", () => {
  it("accepts a minimal input with only projectIdentifier", () => {
    const result = addProjectInputSchema.parse({ projectIdentifier: "Daryl Van Horn" });
    expect(result.projectIdentifier).toBe("Daryl Van Horn");
    expect(result.dryRun).toBe(true); // defaults to safe
  });

  it("rejects an empty projectIdentifier", () => {
    expect(() => addProjectInputSchema.parse({ projectIdentifier: "" })).toThrow();
  });

  it("rejects a missing projectIdentifier", () => {
    expect(() => addProjectInputSchema.parse({})).toThrow();
  });

  it("rejects a malformed serviceDate", () => {
    expect(() => addProjectInputSchema.parse({ projectIdentifier: "x", serviceDate: "08/11/2026" })).toThrow();
  });

  it("accepts a well-formed serviceDate", () => {
    const result = addProjectInputSchema.parse({ projectIdentifier: "x", serviceDate: "2026-08-11" });
    expect(result.serviceDate).toBe("2026-08-11");
  });

  it("allows dryRun to be explicitly disabled", () => {
    const result = addProjectInputSchema.parse({ projectIdentifier: "x", dryRun: false });
    expect(result.dryRun).toBe(false);
  });
});

describe("confirmDispatchInputSchema", () => {
  it("requires a non-empty runId and boolean approve", () => {
    expect(() => confirmDispatchInputSchema.parse({ runId: "", approve: true })).toThrow();
    expect(() => confirmDispatchInputSchema.parse({ runId: "abc" })).toThrow();
    const ok = confirmDispatchInputSchema.parse({ runId: "abc", approve: false });
    expect(ok).toEqual({ runId: "abc", approve: false });
  });
});
