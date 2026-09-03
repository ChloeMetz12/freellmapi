import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  MODE: z.enum(["dry-run", "live"]).default("dry-run"),

  MCP_HTTP_PORT: z.coerce.number().int().positive().default(8787),
  MCP_AUTH_TOKEN: z.string().min(1, "MCP_AUTH_TOKEN must be set — the decision-engine server must not accept unauthenticated tool calls"),

  STATE_DIR: z.string().default("./state"),
  AUDIT_LOG_DIR: z.string().default("./runs"),

  DAILY_LOSS_HALT_PCT: z.coerce.number().min(0).max(1).default(0.1),
  MARGIN_UTILIZATION_CAP: z.coerce.number().min(0).max(1).default(0.8),
  // NOT z.coerce.boolean(): that does Boolean(str), which is true for any
  // non-empty string — MARGIN_ENABLED=false would still coerce to true,
  // silently enabling margin no matter what the operator wrote. Enumerate
  // the actual string values instead.
  MARGIN_ENABLED: z
    .enum(["true", "false"])
    .default("true")
    .transform((v) => v === "true"),
  PDT_EQUITY_THRESHOLD_USD: z.coerce.number().positive().default(25_000),

  FINNHUB_API_KEY: z.string().optional(),
  NEWSAPI_KEY: z.string().optional(),
  BENZINGA_API_KEY: z.string().optional(),
  COINGECKO_API_KEY: z.string().optional(),
  // Used for both macro world/finance news (src/sentiment/providers/xMacroNews.ts)
  // and per-symbol ticker chatter (src/social/providers/xTickerChatter.ts) —
  // requires the paid Basic API tier or above; the free tier's read limits
  // are too low for search at trading cadence.
  X_BEARER_TOKEN: z.string().optional(),

  LLM_GATEWAY_URL: z.string().url().default("http://localhost:3000/v1"),
  LLM_GATEWAY_API_KEY: z.string().optional(),
  SENTIMENT_MODEL: z.string().default("gpt-4o-mini"),
});

export type Env = z.infer<typeof envSchema>;

let cached: Env | undefined;

/** Parses and validates process.env once per process; throws with a clear message on misconfiguration. */
export function loadEnv(): Env {
  if (cached) return cached;
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    throw new Error(`Invalid environment configuration:\n${parsed.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`).join("\n")}`);
  }
  cached = parsed.data;
  return cached;
}
