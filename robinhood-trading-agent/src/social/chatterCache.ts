import { mkdirSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { atomicWriteFileSync } from "../util/atomicWrite.js";
import type { SymbolChatterResult } from "./types.js";

interface CachedChatter {
  result: SymbolChatterResult;
  computedAt: string;
}

const cachedChatterSchema = z.object({
  result: z.object({
    symbol: z.string(),
    score: z.number().min(-1).max(1),
    confidence: z.number().min(0).max(1),
    rationale: z.string(),
    scratchpad: z.string(),
    messageCount: z.number().int().nonnegative(),
    degraded: z.boolean(),
  }),
  computedAt: z.string().datetime({ offset: true }),
});

const DEFAULT_TTL_MS = 5 * 60_000;

/**
 * Ticker chatter doesn't meaningfully change every 1-5 minutes the way a
 * price does, and re-fetching it every compute_decision cycle for the
 * same symbol would burn through the paid X API tier's rate limit fast.
 * One JSON file per symbol, so an operator can inspect/delete a single
 * entry without touching the rest.
 */
export class ChatterCache {
  constructor(
    private readonly stateDir: string,
    private readonly ttlMs: number = DEFAULT_TTL_MS,
  ) {
    mkdirSync(join(stateDir, "chatter-cache"), { recursive: true });
  }

  private filePathFor(symbol: string): string {
    // Symbols are broker tickers (alphanumerics, maybe a dot/dash) — safe
    // to use directly as a filename component, but sanitize defensively
    // against anything that isn't.
    const safe = symbol.replace(/[^A-Za-z0-9._-]/g, "_");
    return join(this.stateDir, "chatter-cache", `${safe}.json`);
  }

  get(symbol: string): SymbolChatterResult | null {
    const filePath = this.filePathFor(symbol);
    if (!existsSync(filePath)) return null;

    let raw: unknown;
    try {
      raw = JSON.parse(readFileSync(filePath, "utf-8"));
    } catch {
      return null;
    }

    const parsed = cachedChatterSchema.safeParse(raw);
    if (!parsed.success) return null;

    const age = Date.now() - new Date(parsed.data.computedAt).getTime();
    if (age > this.ttlMs) return null;

    return parsed.data.result;
  }

  set(result: SymbolChatterResult): void {
    const cached: CachedChatter = { result, computedAt: new Date().toISOString() };
    atomicWriteFileSync(this.filePathFor(result.symbol), JSON.stringify(cached, null, 2));
  }
}
