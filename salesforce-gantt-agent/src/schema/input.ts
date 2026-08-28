import { z } from "zod";

/**
 * Input contract for adding a project to the Gantt schedule. Only
 * `projectIdentifier` is required -- everything else is scraped off the
 * source project record first (mirroring how the manual process copies
 * data from the project record into the new Install Work Order form), and
 * only requested from the caller when it can't be reliably extracted.
 */
export const addProjectInputSchema = z.object({
  /** Customer name, address, or Salesforce record Id -- whatever reliably locates the project record. */
  projectIdentifier: z.string().min(1, "projectIdentifier is required"),
  workOrderType: z.string().optional(),
  includeBattery: z.boolean().optional(),
  includeInstall: z.boolean().optional(),
  serviceTerritory: z.string().optional(),
  /** ISO 8601 date, e.g. "2026-08-11". */
  serviceDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "serviceDate must be YYYY-MM-DD").optional(),
  description: z.string().optional(),
  dryRun: z.boolean().default(true),
});

export type AddProjectInput = z.infer<typeof addProjectInputSchema>;

export const confirmDispatchInputSchema = z.object({
  runId: z.string().min(1),
  approve: z.boolean(),
});

export type ConfirmDispatchInput = z.infer<typeof confirmDispatchInputSchema>;
