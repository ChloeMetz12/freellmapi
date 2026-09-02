import { mkdirSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { ClosedTradeSummary } from "./reflection.js";
import type { WeightAdjustment } from "./update.js";

interface TradeHistoryEntry {
  trade: ClosedTradeSummary;
  adjustments: WeightAdjustment[];
}

const MAX_HISTORY = 50;

/** Rolling window of recent closed trades + their weight adjustments, feeding the periodic LLM reflection pass. */
export class TradeHistoryStore {
  private readonly filePath: string;
  private entries: TradeHistoryEntry[];

  constructor(stateDir: string) {
    mkdirSync(stateDir, { recursive: true });
    this.filePath = join(stateDir, "trade-history.json");
    this.entries = existsSync(this.filePath) ? JSON.parse(readFileSync(this.filePath, "utf-8")) : [];
  }

  append(entry: TradeHistoryEntry): void {
    this.entries = [...this.entries, entry].slice(-MAX_HISTORY);
    writeFileSync(this.filePath, JSON.stringify(this.entries, null, 2));
  }

  recent(n = 10): TradeHistoryEntry[] {
    return this.entries.slice(-n);
  }
}
