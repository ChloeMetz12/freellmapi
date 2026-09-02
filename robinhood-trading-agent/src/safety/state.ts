import { mkdirSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export interface PdtTradeRecord {
  symbol: string;
  /** YYYY-MM-DD */
  dateIso: string;
}

export interface SafetyState {
  /** Set only by an explicit `cli resume` / `resume` tool call — never auto-cleared. */
  manuallyHalted: boolean;
  /** Set by an auto-triggered halt (daily loss or margin-call risk); also requires manual resume to clear. */
  autoHaltReason: string | null;
  dayStartEquity: number | null;
  /** YYYY-MM-DD — the trading day dayStartEquity was captured for. */
  dayStartDateIso: string | null;
  pdtTrades: PdtTradeRecord[];
}

const DEFAULT_STATE: SafetyState = {
  manuallyHalted: false,
  autoHaltReason: null,
  dayStartEquity: null,
  dayStartDateIso: null,
  pdtTrades: [],
};

/** Persists safety/halt/PDT state to disk so a restart never resets the kill-switch (see plan's Deployment & orchestration). */
export class SafetyStateStore {
  private readonly filePath: string;
  private state: SafetyState;

  constructor(stateDir: string) {
    mkdirSync(stateDir, { recursive: true });
    this.filePath = join(stateDir, "safety-state.json");
    this.state = this.load();
  }

  private load(): SafetyState {
    if (!existsSync(this.filePath)) return { ...DEFAULT_STATE };
    return { ...DEFAULT_STATE, ...JSON.parse(readFileSync(this.filePath, "utf-8")) };
  }

  get(): SafetyState {
    return { ...this.state, pdtTrades: [...this.state.pdtTrades] };
  }

  save(state: SafetyState): void {
    this.state = state;
    writeFileSync(this.filePath, JSON.stringify(state, null, 2));
  }
}
