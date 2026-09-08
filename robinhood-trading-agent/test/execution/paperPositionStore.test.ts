import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PaperPositionStore } from "../../src/execution/paperPositionStore.js";

let dir: string | undefined;

afterEach(() => {
  if (dir) rmSync(dir, { recursive: true, force: true });
  dir = undefined;
});

function position(overrides: Partial<Parameters<PaperPositionStore["open"]>[0]> = {}) {
  return {
    symbol: "AAPL",
    assetClass: "equity" as const,
    action: "BUY" as const,
    entryPrice: 230,
    quantity: 1,
    decisionScore: 0.4,
    contributingSignals: [],
    openedAt: "2026-01-15T14:00:00.000Z",
    ...overrides,
  };
}

describe("PaperPositionStore", () => {
  it("round-trips an opened position", () => {
    dir = mkdtempSync(join(tmpdir(), "paper-position-store-"));
    const store = new PaperPositionStore(dir);
    store.open(position());
    expect(new PaperPositionStore(dir).get("AAPL")).toEqual(position());
  });

  it("returns null for a symbol with no open position", () => {
    dir = mkdtempSync(join(tmpdir(), "paper-position-store-"));
    expect(new PaperPositionStore(dir).get("AAPL")).toBeNull();
  });

  it("lists all open positions across symbols", () => {
    dir = mkdtempSync(join(tmpdir(), "paper-position-store-"));
    const store = new PaperPositionStore(dir);
    store.open(position({ symbol: "AAPL" }));
    store.open(position({ symbol: "MSFT" }));
    expect(new PaperPositionStore(dir).all().map((p) => p.symbol).sort()).toEqual(["AAPL", "MSFT"]);
  });

  it("removes a position on close", () => {
    dir = mkdtempSync(join(tmpdir(), "paper-position-store-"));
    const store = new PaperPositionStore(dir);
    store.open(position());
    store.close("AAPL");
    expect(new PaperPositionStore(dir).get("AAPL")).toBeNull();
  });

  it("falls back to no open positions when the file is unparseable JSON", () => {
    dir = mkdtempSync(join(tmpdir(), "paper-position-store-"));
    writeFileSync(join(dir, "paper-positions.json"), "{not valid json");
    expect(new PaperPositionStore(dir).all()).toEqual([]);
  });
});
