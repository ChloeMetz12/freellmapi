import { mkdirSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { RISK_LIMITS } from "../config/riskLimits.js";
import { atomicWriteFileSync } from "../util/atomicWrite.js";
import { DEFAULT_SIGNAL_WEIGHTS, SIGNAL_KEYS, type SignalWeights } from "../strategy/types.js";

/**
 * Keeps only the keys/values from `raw` that are finite numbers *within
 * the bounds `applyLearningUpdate` itself enforces* — a corrupted-but-
 * valid-JSON file (e.g. `{"trend":"1"}`, or a legally-finite but
 * wildly-out-of-range `{"trend":1000000}`) must not flow through into
 * computeSignal's weighted-average arithmetic or silently bypass the
 * min/max clamp that's supposed to be the only way a weight moves.
 * Anything outside [minWeight, maxWeight] is treated exactly like a
 * non-numeric value: dropped, falling back to the default for that key.
 */
function sanitizeWeights(raw: unknown): Partial<SignalWeights> {
  if (typeof raw !== "object" || raw === null) return {};
  const record = raw as Record<string, unknown>;
  const { minWeight, maxWeight } = RISK_LIMITS.learning;
  const sanitized: Partial<SignalWeights> = {};
  for (const key of SIGNAL_KEYS) {
    const value = record[key];
    if (typeof value === "number" && Number.isFinite(value) && value >= minWeight && value <= maxWeight) {
      sanitized[key] = value;
    }
  }
  return sanitized;
}

/**
 * Persists the online-learned per-signal weights to disk so a restart of
 * the decision-engine server (or a fresh Claude session firing) never
 * resets what's been learned — see plan's "Deployment & orchestration".
 */
export class WeightStore {
  private readonly filePath: string;
  private weights: SignalWeights;

  constructor(stateDir: string) {
    mkdirSync(stateDir, { recursive: true });
    this.filePath = join(stateDir, "signal-weights.json");
    this.weights = this.load();
  }

  private load(): SignalWeights {
    if (!existsSync(this.filePath)) return { ...DEFAULT_SIGNAL_WEIGHTS };
    try {
      const raw = JSON.parse(readFileSync(this.filePath, "utf-8"));
      return { ...DEFAULT_SIGNAL_WEIGHTS, ...sanitizeWeights(raw) };
    } catch {
      // Corrupt on-disk weights (partial write, crash mid-save) must not
      // crash the process — degrade to the default weights (losing this
      // run's learned adjustments, not the ability to trade at all).
      return { ...DEFAULT_SIGNAL_WEIGHTS };
    }
  }

  get(): SignalWeights {
    return { ...this.weights };
  }

  save(weights: SignalWeights): void {
    this.weights = weights;
    atomicWriteFileSync(this.filePath, JSON.stringify(weights, null, 2));
  }
}
