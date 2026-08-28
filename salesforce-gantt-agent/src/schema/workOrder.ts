import { z } from "zod";

/**
 * The fully-resolved Work Order model, after merging caller-supplied input
 * (schema/input.ts) with whatever was scraped off the source project record.
 * This is what actually gets typed into the Salesforce Work Order form.
 */
export const resolvedWorkOrderSchema = z.object({
  projectIdentifier: z.string().min(1),
  projectRecordUrl: z.string().url(),
  owner: z.string().min(1),
  dispatcher: z.string().min(1),
  workOrderType: z.string().min(1),
  includeBattery: z.boolean(),
  includeInstall: z.boolean(),
  serviceTerritory: z.string().min(1),
  serviceDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  description: z.string(),
});

export type ResolvedWorkOrder = z.infer<typeof resolvedWorkOrderSchema>;
