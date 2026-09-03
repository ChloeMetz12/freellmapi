import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SafetyStateStore } from "../../src/safety/state.js";

let dir: string | undefined;

afterEach(() => {
  if (dir) rmSync(dir, { recursive: true, force: true });
  dir = undefined;
});

describe("SafetyStateStore", () => {
  it("starts unhalted when no state file exists yet", () => {
    dir = mkdtempSync(join(tmpdir(), "safety-state-"));
    const store = new SafetyStateStore(dir);
    expect(store.get().manuallyHalted).toBe(false);
    expect(store.get().autoHaltReason).toBeNull();
  });

  it("round-trips a valid saved state", () => {
    dir = mkdtempSync(join(tmpdir(), "safety-state-"));
    const store = new SafetyStateStore(dir);
    store.save({ manuallyHalted: true, autoHaltReason: "test halt", dayStartEquity: 1234, dayStartDateIso: "2026-09-02", pdtTrades: [{ symbol: "AAPL", dateIso: "2026-09-02" }] });

    const reloaded = new SafetyStateStore(dir);
    expect(reloaded.get()).toEqual({ manuallyHalted: true, autoHaltReason: "test halt", dayStartEquity: 1234, dayStartDateIso: "2026-09-02", pdtTrades: [{ symbol: "AAPL", dateIso: "2026-09-02" }] });
  });

  it("fails CLOSED (halted) rather than open when the state file is corrupt JSON", () => {
    dir = mkdtempSync(join(tmpdir(), "safety-state-"));
    writeFileSync(join(dir, "safety-state.json"), "{not valid json");

    const store = new SafetyStateStore(dir);
    expect(store.get().manuallyHalted).toBe(true);
    expect(store.get().autoHaltReason).toMatch(/unreadable|invalid JSON/);
  });

  it("fails CLOSED (halted) rather than open when the state file is valid JSON but the wrong shape", () => {
    dir = mkdtempSync(join(tmpdir(), "safety-state-"));
    // dayStartEquity as a string would produce NaN loss-fraction math and
    // silently disable the kill-switch if it were allowed through.
    writeFileSync(join(dir, "safety-state.json"), JSON.stringify({ manuallyHalted: false, autoHaltReason: null, dayStartEquity: "not-a-number", dayStartDateIso: "2026-09-02", pdtTrades: [] }));

    const store = new SafetyStateStore(dir);
    expect(store.get().manuallyHalted).toBe(true);
    expect(store.get().autoHaltReason).toMatch(/failed validation/);
  });

  it("fails CLOSED when dayStartDateIso is not a YYYY-MM-DD string", () => {
    dir = mkdtempSync(join(tmpdir(), "safety-state-"));
    writeFileSync(join(dir, "safety-state.json"), JSON.stringify({ manuallyHalted: false, autoHaltReason: null, dayStartEquity: 10_000, dayStartDateIso: "not-a-date", pdtTrades: [] }));

    const store = new SafetyStateStore(dir);
    expect(store.get().manuallyHalted).toBe(true);
  });

  it("fails CLOSED when a PDT trade record's dateIso is not YYYY-MM-DD, instead of silently undercounting day trades", () => {
    // pdt.ts's window is a Set of "YYYY-MM-DD" strings — a differently
    // formatted dateIso would just never match it (window.has(...) always
    // false), silently undercounting trades and potentially bypassing the
    // PDT limit, rather than erroring anywhere obvious.
    dir = mkdtempSync(join(tmpdir(), "safety-state-"));
    writeFileSync(join(dir, "safety-state.json"), JSON.stringify({ manuallyHalted: false, autoHaltReason: null, dayStartEquity: 10_000, dayStartDateIso: "2026-09-02", pdtTrades: [{ symbol: "AAPL", dateIso: "2026-09-02T00:00:00.000Z" }] }));

    const store = new SafetyStateStore(dir);
    expect(store.get().manuallyHalted).toBe(true);
  });
});
