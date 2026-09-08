import { mkdirSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { atomicWriteFileSync } from "../util/atomicWrite.js";
import type { AssetClass } from "../config/watchlist.js";
import type { SignalKey } from "../strategy/types.js";

export interface PaperPosition {
  symbol: string;
  assetClass: AssetClass;
  action: "BUY" | "SELL";
  entryPrice: number;
  quantity: number;
  decisionScore: number;
  contributingSignals: Array<{ key: SignalKey; vote: number }>;
  openedAt: string;
}

/**
 * Tracks would-be positions opened during dry-run cycles so a later cycle
 * can detect their close and feed record_outcome. In dry-run mode no order
 * is ever actually placed (see README) — nothing ever appears in the real
 * broker account for the live-mode "detect a closed position via
 * get_equity_positions" path to find. This is the in-package substitute:
 * one simulated open position per symbol at a time, persisted server-side
 * like every other piece of durable state, closed out via
 * ToolHandlers.closePaperPosition once the strategy decides to exit.
 */
export class PaperPositionStore {
  private readonly filePath: string;
  private positions: Record<string, PaperPosition>;

  constructor(stateDir: string) {
    mkdirSync(stateDir, { recursive: true });
    this.filePath = join(stateDir, "paper-positions.json");
    this.positions = this.load();
  }

  private load(): Record<string, PaperPosition> {
    if (!existsSync(this.filePath)) return {};
    try {
      const raw: unknown = JSON.parse(readFileSync(this.filePath, "utf-8"));
      return typeof raw === "object" && raw !== null ? (raw as Record<string, PaperPosition>) : {};
    } catch {
      // Corrupt on-disk positions (partial write, crash mid-save) must not
      // crash the process — degrade to no open positions rather than
      // taking down open/get/close_paper_position.
      return {};
    }
  }

  private persist(): void {
    atomicWriteFileSync(this.filePath, JSON.stringify(this.positions, null, 2));
  }

  get(symbol: string): PaperPosition | null {
    return this.positions[symbol] ?? null;
  }

  all(): PaperPosition[] {
    return Object.values(this.positions);
  }

  open(position: PaperPosition): void {
    this.positions = { ...this.positions, [position.symbol]: position };
    this.persist();
  }

  close(symbol: string): void {
    const { [symbol]: _removed, ...rest } = this.positions;
    this.positions = rest;
    this.persist();
  }
}
