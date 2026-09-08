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

describe("ToolHandlers paper-position flow", () => {
  it("opens, lists, and closes a paper position, feeding the same path recordOutcome would", async () => {
    dir = mkdtempSync(join(tmpdir(), "tool-handlers-"));
    const handlers = new ToolHandlers(makeEnv(dir));

    const opened = handlers.openPaperPosition({
      symbol: "AAPL",
      assetClass: "equity",
      action: "BUY",
      entryPrice: 200,
      quantity: 1,
      decisionScore: 0.5,
      contributingSignals: [],
      openedAt: "2026-01-15T14:00:00.000Z",
    });
    expect(opened.opened).toBe(true);
    expect(handlers.getPaperPositions().positions).toHaveLength(1);

    const closed = await handlers.closePaperPosition({
      symbol: "AAPL",
      exitPrice: 220,
      currentEquity: 10_000,
      closedAt: "2026-01-15T20:00:00.000Z",
    });

    expect(closed.closed).toBe(true);
    expect(closed.realizedReturnPct).toBeCloseTo(0.1, 10);
    expect(handlers.getPaperPositions().positions).toHaveLength(0);

    const readiness = handlers.checkLiveReadiness();
    expect(readiness.tradeCount).toBe(1);
    expect(readiness.cumulativeReturnPct).toBeCloseTo(0.1, 10);
  });

  it("computes a positive return for a short (SELL) paper position when price falls", async () => {
    dir = mkdtempSync(join(tmpdir(), "tool-handlers-"));
    const handlers = new ToolHandlers(makeEnv(dir));

    handlers.openPaperPosition({
      symbol: "AAPL",
      assetClass: "equity",
      action: "SELL",
      entryPrice: 200,
      quantity: 1,
      decisionScore: -0.5,
      contributingSignals: [],
      openedAt: "2026-01-15T14:00:00.000Z",
    });

    const closed = await handlers.closePaperPosition({
      symbol: "AAPL",
      exitPrice: 180,
      currentEquity: 10_000,
      closedAt: "2026-01-15T20:00:00.000Z",
    });

    expect(closed.realizedReturnPct).toBeCloseTo(0.1, 10);
  });

  it("refuses to open a second position for a symbol that already has one open", () => {
    dir = mkdtempSync(join(tmpdir(), "tool-handlers-"));
    const handlers = new ToolHandlers(makeEnv(dir));

    handlers.openPaperPosition({ symbol: "AAPL", assetClass: "equity", action: "BUY", entryPrice: 200, quantity: 1, decisionScore: 0.5, contributingSignals: [] });
    const second = handlers.openPaperPosition({ symbol: "AAPL", assetClass: "equity", action: "BUY", entryPrice: 205, quantity: 1, decisionScore: 0.5, contributingSignals: [] });

    expect(second.opened).toBe(false);
    expect(handlers.getPaperPositions().positions).toHaveLength(1);
  });

  it("reports closed=false for a symbol with no open paper position", async () => {
    dir = mkdtempSync(join(tmpdir(), "tool-handlers-"));
    const handlers = new ToolHandlers(makeEnv(dir));

    const closed = await handlers.closePaperPosition({ symbol: "AAPL", exitPrice: 200, currentEquity: 10_000 });
    expect(closed.closed).toBe(false);
  });

  it("marks a same-day round trip as a PDT day trade", async () => {
    dir = mkdtempSync(join(tmpdir(), "tool-handlers-"));
    const handlers = new ToolHandlers(makeEnv(dir));

    handlers.openPaperPosition({
      symbol: "AAPL",
      assetClass: "equity",
      action: "BUY",
      entryPrice: 200,
      quantity: 1,
      decisionScore: 0.5,
      contributingSignals: [],
      openedAt: "2026-01-15T14:00:00.000Z",
    });
    await handlers.closePaperPosition({ symbol: "AAPL", exitPrice: 205, currentEquity: 10_000, closedAt: "2026-01-15T20:00:00.000Z" });

    const state = JSON.parse(readFileSync(join(dir, "safety-state.json"), "utf-8"));
    expect(state.pdtTrades).toEqual([{ symbol: "AAPL", dateIso: "2026-01-15" }]);
  });
});

describe("ToolHandlers.checkLiveReadiness", () => {
  it("reflects trades recorded via recordOutcome, including currentEquity", async () => {
    dir = mkdtempSync(join(tmpdir(), "tool-handlers-"));
    const handlers = new ToolHandlers(makeEnv(dir));

    await handlers.recordOutcome({
      symbol: "AAPL",
      assetClass: "equity",
      action: "BUY",
      decisionScore: 0.5,
      contributingSignals: [],
      realizedReturnPct: 0.02,
      isDayTrade: false,
      currentEquity: 10_200,
      closedAt: "2026-01-15T23:00:00.000Z",
    });

    const result = handlers.checkLiveReadiness();
    expect(result.tradeCount).toBe(1);
    expect(result.cumulativeReturnPct).toBeCloseTo(0.02, 10);
    // Nowhere near the graduation thresholds off a single trade.
    expect(result.ready).toBe(false);
  });
});
