#!/usr/bin/env tsx
import { Command } from "commander";
import { loadEnv } from "../config/env.js";
import { applyEnvRiskOverrides } from "../config/riskLimits.js";
import { ToolHandlers } from "../mcp/toolHandlers.js";

const env = loadEnv();
applyEnvRiskOverrides(env);
const handlers = new ToolHandlers(env);

const program = new Command();
program.name("robinhood-trading-agent").description("Operate the decision-engine's persisted safety/halt state directly, without going through the MCP server.");

program
  .command("status")
  .description("Show run mode, halt state, PDT trade count, and current learned signal weights.")
  .action(() => {
    console.log(JSON.stringify(handlers.getStatus(), null, 2));
  });

program
  .command("halt <reason>")
  .description("Immediately halt trading. Only cleared by `resume`.")
  .action((reason: string) => {
    console.log(JSON.stringify(handlers.halt(reason), null, 2));
  });

program
  .command("resume")
  .description("Clear a manual or auto-triggered halt.")
  .action(() => {
    console.log(JSON.stringify(handlers.resume(), null, 2));
  });

program.parse();
