import { mkdirSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { atomicWriteFileSync } from "../util/atomicWrite.js";
import type { ClosedTradeSummary } from "./reflection.js";
import type { WeightAdjustment } from "./update.js";

interface TradeHistoryEntry {
  trade: ClosedTradeSummary;
  adjustments: WeightAdjustment[];
}

// Must stay above LIVE_READINESS.minTrades (see config/riskLimits.ts) with
// headroom — evaluateLiveReadiness reads the full stored history, and a cap
// exactly at the threshold would mean the oldest qualifying trade rolls off
// the instant a new one arrives, every time.
const MAX_HISTORY = 60;

/** Rolling window of recent closed trades + their weight adjustments, feeding the periodic LLM reflection pass. */
export class TradeHistoryStore {
  private readonly filePath: string;
  private entries: TradeHistoryEntry[];

  constructor(stateDir: string) {
    mkdirSync(stateDir, { recursive: true });
    this.filePath = join(stateDir, "trade-history.json");
    this.entries = this.load();
  }

  private load(): TradeHistoryEntry[] {
    if (!existsSync(this.filePath)) return [];
    try {
      return JSON.parse(readFileSync(this.filePath, "utf-8"));
    } catch {
      // Corrupt on-disk history (partial write, crash mid-save) must not
      // crash the process — degrade to an empty rolling history rather
      // than taking down record_outcome (and with it, the learning update).
      return [];
    }
  }

  append(entry: TradeHistoryEntry): void {
    this.entries = [...this.entries, entry].slice(-MAX_HISTORY);
    atomicWriteFileSync(this.filePath, JSON.stringify(this.entries, null, 2));
  }

  recent(n = 10): TradeHistoryEntry[] {
    return this.entries.slice(-n);
  }

  /** The full rolling window (up to MAX_HISTORY entries) — used by evaluateLiveReadiness. */
  all(): TradeHistoryEntry[] {
    return [...this.entries];
  }
}
