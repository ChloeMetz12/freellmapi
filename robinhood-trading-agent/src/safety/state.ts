import { mkdirSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";

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

const pdtTradeRecordSchema = z.object({ symbol: z.string(), dateIso: z.string() });

/** Validates the on-disk shape, not just that it's parseable JSON — a corrupted-but-valid-JSON file (e.g. dayStartEquity as a string) must not flow through into NaN equity-loss math and silently disable the kill-switch. */
const safetyStateSchema = z.object({
  manuallyHalted: z.boolean(),
  autoHaltReason: z.string().nullable(),
  dayStartEquity: z.number().nullable(),
  dayStartDateIso: z.string().nullable(),
  pdtTrades: z.array(pdtTradeRecordSchema),
});

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

    let raw: unknown;
    try {
      raw = JSON.parse(readFileSync(this.filePath, "utf-8"));
    } catch (err) {
      return this.corruptedFallback(`safety state file was unreadable/invalid JSON (${(err as Error).message})`);
    }

    const parsed = safetyStateSchema.safeParse(raw);
    if (!parsed.success) {
      return this.corruptedFallback(`safety state file failed validation (${parsed.error.issues.map((i) => i.path.join(".")).join(", ")})`);
    }
    return parsed.data;
  }

  /**
   * Fail CLOSED, not open: this is a kill-switch, so state this untrustworthy
   * must not silently resume trading (as falling back to plain DEFAULT_STATE
   * would). Halt immediately with an explicit corruption reason and require
   * an operator to `resume` once they've confirmed what happened to the
   * file — the day-start-equity/PDT baselines still rebuild safely from
   * scratch on the next check, same as a normal fresh install.
   */
  private corruptedFallback(reason: string): SafetyState {
    return { ...DEFAULT_STATE, manuallyHalted: true, autoHaltReason: `${reason} — halted until manually resumed.` };
  }

  get(): SafetyState {
    return { ...this.state, pdtTrades: [...this.state.pdtTrades] };
  }

  save(state: SafetyState): void {
    this.state = state;
    writeFileSync(this.filePath, JSON.stringify(state, null, 2));
  }
}
