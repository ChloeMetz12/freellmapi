import { describe, expect, it } from "vitest";
import { resolvedWorkOrderSchema } from "../../src/schema/workOrder.js";

const validWorkOrder = {
  projectIdentifier: "Daryl Van Horn",
  projectRecordUrl: "https://example.my.salesforce.com/001xx",
  owner: "Andrew Metz",
  dispatcher: "Andrew Metz",
  workOrderType: "SolarEdge Backup",
  includeBattery: true,
  includeInstall: true,
  serviceTerritory: "Richmond Install",
  serviceDate: "2026-08-11",
  description: "Install per project notes",
};

describe("resolvedWorkOrderSchema", () => {
  it("accepts a fully-resolved work order", () => {
    expect(() => resolvedWorkOrderSchema.parse(validWorkOrder)).not.toThrow();
  });

  it("rejects when required fields like workOrderType or serviceTerritory are missing (couldn't be extracted or supplied)", () => {
    const { workOrderType, ...rest } = validWorkOrder;
    expect(() => resolvedWorkOrderSchema.parse(rest)).toThrow();
  });

  it("rejects an invalid serviceDate format", () => {
    expect(() => resolvedWorkOrderSchema.parse({ ...validWorkOrder, serviceDate: "not-a-date" })).toThrow();
  });

  it("rejects a non-URL projectRecordUrl", () => {
    expect(() => resolvedWorkOrderSchema.parse({ ...validWorkOrder, projectRecordUrl: "not-a-url" })).toThrow();
  });
});
