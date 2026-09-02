import { mkdirSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { DEFAULT_SIGNAL_WEIGHTS, type SignalWeights } from "../strategy/types.js";

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
    const raw = JSON.parse(readFileSync(this.filePath, "utf-8"));
    return { ...DEFAULT_SIGNAL_WEIGHTS, ...raw };
  }

  get(): SignalWeights {
    return { ...this.weights };
  }

  save(weights: SignalWeights): void {
    this.weights = weights;
    writeFileSync(this.filePath, JSON.stringify(weights, null, 2));
  }
}
