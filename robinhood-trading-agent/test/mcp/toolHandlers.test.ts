import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ToolHandlers } from "../../src/mcp/toolHandlers.js";
import type { Env } from "../../src/config/env.js";
import type { OhlcvBar } from "../../src/marketdata/types.js";

let dir: string | undefined;

afterEach(() => {
  if (dir) rmSync(dir, { recursive: true, force: true });
  dir = undefined;
});

function makeEnv(stateDir: string): Env {
  return {
    MODE: "dry-run",
    MCP_HTTP_PORT: 8787,
    MCP_AUTH_TOKEN: "test-token",
    STATE_DIR: stateDir,
    AUDIT_LOG_DIR: join(stateDir, "runs"),
    DAILY_LOSS_HALT_PCT: 0.1,
    MARGIN_UTILIZATION_CAP: 0.8,
    MARGIN_ENABLED: true,
    PDT_EQUITY_THRESHOLD_USD: 25_000,
    LLM_GATEWAY_URL: "http://localhost:3000/v1",
    SENTIMENT_MODEL: "gpt-4o-mini",
  };
}

function barsFromCloses(closes: number[], order: "ascending" | "descending" = "ascending"): OhlcvBar[] {
  const bars = closes.map((close, i) => ({
    timestamp: new Date(2026, 0, 1, 0, i).toISOString(),
    open: close,
    high: close,
    low: close,
    close,
    volume: 1_000_000,
  }));
  return order === "ascending" ? bars : bars.reverse();
}

describe("ToolHandlers.computeDecision", () => {
  it("rejects newest-first bars instead of silently computing wrong indicator values", () => {
    dir = mkdtempSync(join(tmpdir(), "tool-handlers-"));
    const handlers = new ToolHandlers(makeEnv(dir));
    const closes = Array.from({ length: 30 }, (_, i) => 100 + i);
    expect(() => handlers.computeDecision("SPY", barsFromCloses(closes, "descending"))).toThrow(/sorted oldest-first/);
  });

  it("accepts oldest-first bars", () => {
    dir = mkdtempSync(join(tmpdir(), "tool-handlers-"));
    const handlers = new ToolHandlers(makeEnv(dir));
    const closes = Array.from({ length: 30 }, (_, i) => 100 + i);
    expect(() => handlers.computeDecision("SPY", barsFromCloses(closes, "ascending"))).not.toThrow();
  });
});

describe("ToolHandlers.recordOutcome", () => {
  it("dates the PDT record by the trade's closedAt, not by when record_outcome happens to be called", async () => {
    dir = mkdtempSync(join(tmpdir(), "tool-handlers-"));
    const handlers = new ToolHandlers(makeEnv(dir));

    await handlers.recordOutcome({
      symbol: "AAPL",
      assetClass: "equity",
      action: "BUY",
      decisionScore: 0.5,
      contributingSignals: [],
      realizedReturnPct: 0.01,
      isDayTrade: true,
      currentEquity: 10_000,
      closedAt: "2026-01-15T23:00:00.000Z", // deliberately not "today"
    });

    const state = JSON.parse(readFileSync(join(dir, "safety-state.json"), "utf-8"));
    expect(state.pdtTrades).toEqual([{ symbol: "AAPL", dateIso: "2026-01-15" }]);
  });
});
