import { mkdirSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { DEFAULT_SIGNAL_WEIGHTS, SIGNAL_KEYS, type SignalWeights } from "../strategy/types.js";

/** Keeps only the keys/values from `raw` that are actually finite numbers for a known signal — a corrupted-but-valid-JSON file (e.g. `{"trend":"1"}` or a NaN) must not flow through into computeSignal's weighted-average arithmetic. */
function sanitizeWeights(raw: unknown): Partial<SignalWeights> {
  if (typeof raw !== "object" || raw === null) return {};
  const record = raw as Record<string, unknown>;
  const sanitized: Partial<SignalWeights> = {};
  for (const key of SIGNAL_KEYS) {
    const value = record[key];
    if (typeof value === "number" && Number.isFinite(value)) {
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
    writeFileSync(this.filePath, JSON.stringify(weights, null, 2));
  }
}
