import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { WeightStore } from "../../src/learning/weightStore.js";
import { DEFAULT_SIGNAL_WEIGHTS } from "../../src/strategy/types.js";

let dir: string | undefined;

afterEach(() => {
  if (dir) rmSync(dir, { recursive: true, force: true });
  dir = undefined;
});

describe("WeightStore", () => {
  it("round-trips valid saved weights", () => {
    dir = mkdtempSync(join(tmpdir(), "weight-store-"));
    const store = new WeightStore(dir);
    const weights = { ...DEFAULT_SIGNAL_WEIGHTS, trend: 2.5 };
    store.save(weights);
    expect(new WeightStore(dir).get()).toEqual(weights);
  });

  it("falls back to the default for a key with a non-numeric on-disk value", () => {
    dir = mkdtempSync(join(tmpdir(), "weight-store-"));
    writeFileSync(join(dir, "signal-weights.json"), JSON.stringify({ ...DEFAULT_SIGNAL_WEIGHTS, trend: "not-a-number" }));

    const weights = new WeightStore(dir).get();
    expect(weights.trend).toBe(DEFAULT_SIGNAL_WEIGHTS.trend);
  });

  it("falls back to the default for a key holding null instead of a number", () => {
    dir = mkdtempSync(join(tmpdir(), "weight-store-"));
    writeFileSync(join(dir, "signal-weights.json"), JSON.stringify({ ...DEFAULT_SIGNAL_WEIGHTS, trend: null }));

    const weights = new WeightStore(dir).get();
    expect(weights.trend).toBe(DEFAULT_SIGNAL_WEIGHTS.trend);
  });

  it("falls back entirely to defaults when the file is unparseable JSON", () => {
    dir = mkdtempSync(join(tmpdir(), "weight-store-"));
    writeFileSync(join(dir, "signal-weights.json"), "{not valid json");

    expect(new WeightStore(dir).get()).toEqual(DEFAULT_SIGNAL_WEIGHTS);
  });

  it("ignores unknown keys rather than polluting the weights object", () => {
    dir = mkdtempSync(join(tmpdir(), "weight-store-"));
    writeFileSync(join(dir, "signal-weights.json"), JSON.stringify({ ...DEFAULT_SIGNAL_WEIGHTS, notARealSignal: 99 }));

    const weights = new WeightStore(dir).get() as Record<string, unknown>;
    expect(weights.notARealSignal).toBeUndefined();
  });
});
