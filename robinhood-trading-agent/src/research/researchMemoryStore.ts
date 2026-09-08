import { mkdirSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { atomicWriteFileSync } from "../util/atomicWrite.js";

export const RESEARCH_EVENT_KINDS = [
  "forum_skim",
  "search_hit",
  "search_fail",
  "tool_fail",
  "thesis",
  "lesson",
] as const;

export type ResearchEventKind = (typeof RESEARCH_EVENT_KINDS)[number];

export interface ResearchEvent {
  kind: ResearchEventKind;
  /** Site or tool name, e.g. "reddit", "stocktwits", "finviz", "get_symbol_chatter". */
  source: string;
  summary: string;
  symbol?: string;
  url?: string;
  /** Optional structured tags the orchestrator wants future cycles to notice. */
  tags?: string[];
  recordedAt: string;
}

const MAX_EVENTS = 200;

/**
 * Durable cross-cycle memory for forum/site research and tool/search
 * failures. Distinct from trade-history learning (which only moves signal
 * weights on closed PnL): this store lets later cycles see what was tried,
 * what broke, and what theses/lessons were logged — so the orchestrator
 * and reflection pass can compound understanding without inventing scores.
 */
export class ResearchMemoryStore {
  private readonly filePath: string;
  private events: ResearchEvent[];

  constructor(stateDir: string) {
    mkdirSync(stateDir, { recursive: true });
    this.filePath = join(stateDir, "research-memory.json");
    this.events = this.load();
  }

  private load(): ResearchEvent[] {
    if (!existsSync(this.filePath)) return [];
    try {
      const raw = JSON.parse(readFileSync(this.filePath, "utf-8"));
      return Array.isArray(raw) ? raw : [];
    } catch {
      return [];
    }
  }

  append(event: Omit<ResearchEvent, "recordedAt"> & { recordedAt?: string }): ResearchEvent {
    const full: ResearchEvent = {
      ...event,
      recordedAt: event.recordedAt ?? new Date().toISOString(),
    };
    this.events = [...this.events, full].slice(-MAX_EVENTS);
    atomicWriteFileSync(this.filePath, JSON.stringify(this.events, null, 2));
    return full;
  }

  recent(n = 30): ResearchEvent[] {
    return this.events.slice(-n);
  }

  /** Recent failures only — used to avoid repeating dead sources the same day. */
  recentFailures(n = 20): ResearchEvent[] {
    return this.events.filter((e) => e.kind === "search_fail" || e.kind === "tool_fail").slice(-n);
  }

  /** Aggregate failure counts by source over the stored window. */
  failureCountsBySource(): Record<string, number> {
    const counts: Record<string, number> = {};
    for (const e of this.events) {
      if (e.kind !== "search_fail" && e.kind !== "tool_fail") continue;
      counts[e.source] = (counts[e.source] ?? 0) + 1;
    }
    return counts;
  }

  all(): ResearchEvent[] {
    return [...this.events];
  }
}
