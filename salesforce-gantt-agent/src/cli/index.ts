#!/usr/bin/env tsx
/**
 * Standalone CLI, useful for testing the workflow without an MCP/LLM
 * caller in the loop. Reuses the exact same workflow/addProjectToGantt.ts
 * orchestration the MCP server uses -- no separate implementation.
 *
 * Usage:
 *   salesforce-gantt-agent add-project --project "Daryl Van Horn" --dry-run
 *   salesforce-gantt-agent confirm-dispatch --run-id <id> --approve
 */
import { Command } from "commander";
import { loadEnv } from "../config/env.js";
import { addProjectInputSchema } from "../schema/input.js";
import { addProjectToGantt, confirmDispatch } from "../workflow/addProjectToGantt.js";
import { confirmDispatchInteractively } from "../safety/confirm.js";

const program = new Command();
program.name("salesforce-gantt-agent");

program
  .command("add-project")
  .requiredOption("--project <identifier>", "Customer name, address, or record Id to locate the project")
  .option("--work-order-type <type>", "e.g. \"SolarEdge Backup\"")
  .option("--include-battery", "Include battery sub-option")
  .option("--include-install", "Include install sub-option")
  .option("--service-territory <territory>", "e.g. \"Richmond Install\"")
  .option("--service-date <date>", "YYYY-MM-DD")
  .option("--description <text>")
  .option("--dry-run", "Simulate without mutating Salesforce (default)", true)
  .option("--live", "Actually perform the changes in Salesforce")
  .action(async (opts) => {
    const env = loadEnv();
    const input = addProjectInputSchema.parse({
      projectIdentifier: opts.project,
      workOrderType: opts.workOrderType,
      includeBattery: Boolean(opts.includeBattery),
      includeInstall: Boolean(opts.includeInstall),
      serviceTerritory: opts.serviceTerritory,
      serviceDate: opts.serviceDate,
      description: opts.description,
      dryRun: opts.live ? false : true,
    });

    const outcome = await addProjectToGantt(input, env);
    console.log(JSON.stringify(outcome, null, 2));

    if (outcome.type === "PendingConfirmation") {
      const approve = await confirmDispatchInteractively(outcome);
      const finalOutcome = await confirmDispatch(outcome.runId, approve);
      console.log(JSON.stringify(finalOutcome, null, 2));
    }
  });

program
  .command("confirm-dispatch")
  .requiredOption("--run-id <id>")
  .option("--approve", "Approve the pending dispatch", false)
  .action(async (opts) => {
    const outcome = await confirmDispatch(opts.runId, Boolean(opts.approve));
    console.log(JSON.stringify(outcome, null, 2));
  });

program.parseAsync(process.argv);
