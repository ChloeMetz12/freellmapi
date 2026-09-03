#!/usr/bin/env tsx
/**
 * The decision-engine MCP server (see README/plan "Deployment &
 * orchestration"). This process never calls Robinhood — it exposes the
 * deterministic strategy/safety/learning computation as tools for a
 * persistent Claude session to call each cycle, alongside that session's
 * own `RobinHood_Trade` connector tools (get_quote, place_order, etc.).
 *
 * Served over HTTP (not stdio) with a required bearer-token check, since
 * the calling Claude session runs remotely and needs a stable URL to hit
 * on every cron-triggered firing.
 */
import { timingSafeEqual } from "node:crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createMcpExpressApp } from "@modelcontextprotocol/sdk/server/express.js";
import { loadEnv } from "../config/env.js";
import { applyEnvRiskOverrides } from "../config/riskLimits.js";
import { ToolHandlers } from "./toolHandlers.js";
import { getSentimentInputSchema, computeDecisionInputSchema, checkSafetyInputSchema, sizeOrderInputSchema, recordOutcomeInputSchema, haltInputSchema, resumeInputSchema, getStatusInputSchema, generateReflectionInputSchema } from "../schema/tools.js";

const env = loadEnv();
applyEnvRiskOverrides(env);
const handlers = new ToolHandlers(env);

function jsonResult(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}

function buildServer(): McpServer {
  const server = new McpServer({ name: "robinhood-trading-agent", version: "0.1.0" });

  server.registerTool(
    "get_sentiment",
    {
      title: "Refresh market-trend + news sentiment",
      description: "Fetches financial and world/political headlines and combines them with a market-trend snapshot into a bounded -1..1 sentiment score via an LLM reasoning call. Caches the result for compute_decision to use. Call this on a slower cadence than compute_decision (e.g. once at session open and periodically thereafter), not every cycle.",
      inputSchema: getSentimentInputSchema.shape,
    },
    async (input) => jsonResult(await handlers.getSentiment(input.marketTrend)),
  );

  server.registerTool(
    "compute_decision",
    {
      title: "Compute a BUY/SELL/HOLD trading decision",
      description: "Runs the candlestick/indicator/sentiment strategy over the given OHLCV bars (fetch these via RobinHood_Trade's own quote/history tools first) using the current online-learned signal weights. Returns an action, confidence, and which signals drove it. This does not place any order.",
      inputSchema: computeDecisionInputSchema.shape,
    },
    async (input) => jsonResult(handlers.computeDecision(input.symbol, input.bars)),
  );

  server.registerTool(
    "check_safety",
    {
      title: "Check the daily-loss / margin-call kill-switch",
      description: "MUST be called and confirmed halted=false before placing any order. Checks today's equity drawdown against the hard daily-loss halt and, if margin is in use, margin-call risk. A halt (auto or manual) persists until an explicit `resume` call.",
      inputSchema: checkSafetyInputSchema.shape,
    },
    async (input) => jsonResult(handlers.checkSafety(input.currentEquity, input.marginMaintenanceUtilization)),
  );

  server.registerTool(
    "size_order",
    {
      title: "Size a position for a BUY/SELL decision",
      description: "Given a decision from compute_decision (already confirmed clear by check_safety) plus current account buying power, computes the order size using the confidence- and volatility-scaled sizing formula and returns an order plan for the calling session to actually submit via RobinHood_Trade's place_order tool. Returns plan=null for a HOLD or a zero-size result.",
      inputSchema: sizeOrderInputSchema.shape,
    },
    async (input) => jsonResult(handlers.sizeOrder(input)),
  );

  server.registerTool(
    "record_outcome",
    {
      title: "Record a closed trade's outcome",
      description: "Call after a position opened from a prior decision has closed (or after any executed order settles) so the online-learning weight update can run and, for equities, the PDT day-trade counter stays accurate. Also feeds the rolling trade history that generate_reflection reads.",
      inputSchema: recordOutcomeInputSchema.shape,
    },
    async (input) => jsonResult(await handlers.recordOutcome(input)),
  );

  server.registerTool(
    "generate_reflection",
    {
      title: "Generate a human-readable learning reflection",
      description: "Best-effort LLM pass over recent closed trades and weight adjustments, producing a plain-language rationale for the audit log. Purely for human interpretability — it never changes the live weights itself. Returns rationale=null if there isn't enough recent history or the call fails.",
      inputSchema: generateReflectionInputSchema.shape,
    },
    async () => jsonResult(await handlers.generateReflection()),
  );

  server.registerTool(
    "halt",
    {
      title: "Manually halt all trading",
      description: "Immediately halts trading regardless of current equity/margin state. Only cleared by a separate `resume` call — never auto-clears.",
      inputSchema: haltInputSchema.shape,
    },
    async (input) => jsonResult(handlers.halt(input.reason)),
  );

  server.registerTool(
    "resume",
    {
      title: "Resume trading after a halt",
      description: "Clears both a manual halt and any auto-triggered halt (daily-loss or margin-call). This is the only way either is ever cleared.",
      inputSchema: resumeInputSchema.shape,
    },
    async () => jsonResult(handlers.resume()),
  );

  server.registerTool(
    "get_status",
    {
      title: "Get current agent status",
      description: "Returns run mode (dry-run/live), halt state and reason, day-start equity baseline, PDT trade count, current learned signal weights, and the configured risk limits.",
      inputSchema: getStatusInputSchema.shape,
    },
    async () => jsonResult(handlers.getStatus()),
  );

  return server;
}

/** Timing-safe comparison — a shared-secret bearer token must never be checked with `!==`, which leaks a character-by-character timing signal. */
function tokensMatch(a: string, b: string): boolean {
  // Check string length before allocating any Buffers: `a` is the
  // attacker-controlled Authorization header, so an oversized value
  // should be rejected without the cost of converting it. Comparing
  // string .length here (not Buffer byte length) still leaks only length,
  // same tradeoff as before — it just avoids paying an allocation for a
  // request that's guaranteed to be rejected anyway.
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

function requireAuth(req: import("express").Request, res: import("express").Response, next: import("express").NextFunction) {
  const header = req.header("authorization");
  const token = header?.startsWith("Bearer ") ? header.slice("Bearer ".length) : undefined;
  if (!token || !tokensMatch(token, env.MCP_AUTH_TOKEN)) {
    res.status(401).json({ jsonrpc: "2.0", error: { code: -32001, message: "Unauthorized" }, id: null });
    return;
  }
  next();
}

const app = createMcpExpressApp({ host: "0.0.0.0", allowedHosts: undefined });
app.use(requireAuth);

app.post("/mcp", async (req, res) => {
  const server = buildServer();
  try {
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
    res.on("close", () => {
      transport.close();
      server.close();
    });
  } catch (err) {
    console.error("Error handling MCP request:", err);
    if (!res.headersSent) {
      res.status(500).json({ jsonrpc: "2.0", error: { code: -32603, message: "Internal server error" }, id: null });
    }
  }
});

app.listen(env.MCP_HTTP_PORT, () => {
  console.log(`robinhood-trading-agent decision-engine MCP server listening on :${env.MCP_HTTP_PORT} (mode=${env.MODE})`);
});
