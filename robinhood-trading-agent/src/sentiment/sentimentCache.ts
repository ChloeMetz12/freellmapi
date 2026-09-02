import { mkdirSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { SentimentResult } from "./types.js";

interface CachedSentiment {
  result: SentimentResult;
  computedAt: string;
}

/**
 * `compute_decision` runs every 1-5 minutes but sentiment refreshes on a
 * slower cadence (plan: "once at session open and on a periodic
 * re-check") — this caches the last `get_sentiment` result so
 * `compute_decision` doesn't re-fetch news / re-call the LLM every cycle.
 */
export class SentimentCache {
  private readonly filePath: string;

  constructor(stateDir: string) {
    mkdirSync(stateDir, { recursive: true });
    this.filePath = join(stateDir, "sentiment-cache.json");
  }

  get(): CachedSentiment | null {
    if (!existsSync(this.filePath)) return null;
    try {
      return JSON.parse(readFileSync(this.filePath, "utf-8"));
    } catch {
      // On-disk state can be corrupted (partial write, crash mid-save) —
      // degrade to "no cached sentiment" rather than crashing
      // compute_decision and, with it, the whole agent loop.
      return null;
    }
  }

  set(result: SentimentResult): void {
    const cached: CachedSentiment = { result, computedAt: new Date().toISOString() };
    writeFileSync(this.filePath, JSON.stringify(cached, null, 2));
  }
}
