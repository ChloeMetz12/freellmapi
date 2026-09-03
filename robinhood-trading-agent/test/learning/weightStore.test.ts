import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { WeightStore } from "../../src/learning/weightStore.js";
import { DEFAULT_SIGNAL_WEIGHTS } from "../../src/strategy/types.js";
import { RISK_LIMITS } from "../../src/config/riskLimits.js";

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

  it("falls back to the default for a finite but out-of-bounds on-disk value, not just non-numeric ones", () => {
    // A corrupted-but-parseable file with e.g. trend: 1000000 is a valid
    // finite number, but it's outside [minWeight, maxWeight] — the only
    // range applyLearningUpdate's own clamp ever produces. Letting it
    // through would silently bypass that bound entirely.
    dir = mkdtempSync(join(tmpdir(), "weight-store-"));
    writeFileSync(join(dir, "signal-weights.json"), JSON.stringify({ ...DEFAULT_SIGNAL_WEIGHTS, trend: RISK_LIMITS.learning.maxWeight + 1000 }));

    const weights = new WeightStore(dir).get();
    expect(weights.trend).toBe(DEFAULT_SIGNAL_WEIGHTS.trend);
  });

  it("falls back to the default for a negative on-disk value", () => {
    dir = mkdtempSync(join(tmpdir(), "weight-store-"));
    writeFileSync(join(dir, "signal-weights.json"), JSON.stringify({ ...DEFAULT_SIGNAL_WEIGHTS, trend: -5 }));

    const weights = new WeightStore(dir).get();
    expect(weights.trend).toBe(DEFAULT_SIGNAL_WEIGHTS.trend);
  });

  it("accepts a value exactly at the min/max bound (a legitimately clamped learned weight)", () => {
    dir = mkdtempSync(join(tmpdir(), "weight-store-"));
    writeFileSync(join(dir, "signal-weights.json"), JSON.stringify({ ...DEFAULT_SIGNAL_WEIGHTS, trend: RISK_LIMITS.learning.maxWeight }));

    const weights = new WeightStore(dir).get();
    expect(weights.trend).toBe(RISK_LIMITS.learning.maxWeight);
  });

  it("ignores unknown keys rather than polluting the weights object", () => {
    dir = mkdtempSync(join(tmpdir(), "weight-store-"));
    writeFileSync(join(dir, "signal-weights.json"), JSON.stringify({ ...DEFAULT_SIGNAL_WEIGHTS, notARealSignal: 99 }));

    const weights = new WeightStore(dir).get() as Record<string, unknown>;
    expect(weights.notARealSignal).toBeUndefined();
  });
});
