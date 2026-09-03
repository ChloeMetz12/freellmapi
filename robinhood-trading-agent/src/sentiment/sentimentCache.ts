import { mkdirSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { atomicWriteFileSync } from "../util/atomicWrite.js";
import type { SentimentResult } from "./types.js";

interface CachedSentiment {
  result: SentimentResult;
  computedAt: string;
}

/** Validates the on-disk shape, not just that it's parseable JSON — a corrupted-but-valid-JSON cache (e.g. score as a string, or a missing field) must not flow a bad score into computeSignal's NaN-prone arithmetic. */
const cachedSentimentSchema = z.object({
  result: z.object({
    score: z.number().min(-1).max(1),
    confidence: z.number().min(0).max(1),
    rationale: z.string(),
    scratchpad: z.string(),
    degraded: z.boolean(),
  }),
  computedAt: z.string(),
});

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
    let raw: unknown;
    try {
      raw = JSON.parse(readFileSync(this.filePath, "utf-8"));
    } catch {
      // On-disk state can be corrupted (partial write, crash mid-save) —
      // degrade to "no cached sentiment" rather than crashing
      // compute_decision and, with it, the whole agent loop.
      return null;
    }

    const parsed = cachedSentimentSchema.safeParse(raw);
    // Same degrade-to-neutral-by-omission behavior on a shape mismatch as
    // on a parse failure — a cache entry that doesn't match the expected
    // shape (missing/mistyped score, etc.) is exactly as untrustworthy as
    // an unreadable file, and must not hand computeSignal a non-numeric or
    // out-of-range sentiment score.
    return parsed.success ? parsed.data : null;
  }

  set(result: SentimentResult): void {
    const cached: CachedSentiment = { result, computedAt: new Date().toISOString() };
    atomicWriteFileSync(this.filePath, JSON.stringify(cached, null, 2));
  }
}
