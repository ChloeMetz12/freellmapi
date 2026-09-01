#!/usr/bin/env tsx
/**
 * MCP server exposing this tool as two on-demand tools any Claude session
 * can call: `add_gantt_project` and `confirm_dispatch`. There is
 * deliberately no scheduled/background trigger anywhere in this file --
 * the agent only ever acts when a caller explicitly invokes a tool naming
 * a specific project.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { loadEnv } from "../config/env.js";
import { addProjectInputSchema, confirmDispatchInputSchema } from "../schema/input.js";
import { addProjectToGantt, confirmDispatch } from "../workflow/addProjectToGantt.js";

const env = loadEnv();

const server = new McpServer({ name: "salesforce-gantt-agent", version: "0.1.0" });

server.registerTool(
  "add_gantt_project",
  {
    title: "Add project to Gantt schedule",
    description:
      "Adds a single, explicitly-named project to Salesforce Field Service's Classic Dispatch Console (Gantt schedule): " +
      "creates the Install Work Order, fills in its fields (scraping most of them off the source project record), " +
      "and attempts automatic technician assignment via Get Candidates. If no technician can be assigned, returns " +
      "NeedsManualAssignment and emails the user -- it never guesses a drag-and-drop placement. If a technician IS " +
      "assigned and dryRun is false, returns PendingConfirmation and waits for a separate confirm_dispatch call " +
      "before actually dispatching (dispatch is irreversible -- it pushes the job to the technician's phone). " +
      "Only call this when the user names a specific project by name; never call it speculatively or in a loop.",
    inputSchema: addProjectInputSchema.shape,
  },
  async (input) => {
    const outcome = await addProjectToGantt(input, env);
    return { content: [{ type: "text", text: JSON.stringify(outcome, null, 2) }] };
  },
);

server.registerTool(
  "confirm_dispatch",
  {
    title: "Confirm or cancel a pending Gantt dispatch",
    description:
      "Resumes a run that add_gantt_project left in PendingConfirmation. Pass approve: true to actually set the " +
      "appointment to Dispatched (irreversible -- pushes to the technician's mobile app), or approve: false to " +
      "cancel and leave the Work Order/Service Appointment as-is for manual handling.",
    inputSchema: confirmDispatchInputSchema.shape,
  },
  async (input) => {
    const outcome = await confirmDispatch(input.runId, input.approve);
    return { content: [{ type: "text", text: JSON.stringify(outcome, null, 2) }] };
  },
);

const transport = new StdioServerTransport();
await server.connect(transport);
