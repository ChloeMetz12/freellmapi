import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { atomicWriteFileSync } from "../util/atomicWrite.js";
import { ResearchMemoryStore, type ResearchEvent } from "./researchMemoryStore.js";
import { sanitizeLessonText } from "./sanitizeLessonText.js";

export const LESSONS_FILENAME = "Lessons.md";

export interface ExportResearchLessonsOptions {
  stateDir: string;
  /** Destination directory (e.g. vault `Agents/Trading Research`). */
  outDir: string;
  /** If true, compute the write but do not touch disk. */
  dryRun?: boolean;
}

export interface ExportResearchLessonsResult {
  sourceEvents: number;
  lessonEvents: number;
  newlyAppended: number;
  skippedDuplicates: number;
  outPath: string;
  dryRun: boolean;
}

function lessonFingerprint(event: ResearchEvent): string {
  const material = [
    event.kind,
    event.source,
    event.symbol ?? "",
    sanitizeLessonText(event.summary),
    (event.tags ?? []).slice().sort().join(","),
  ].join("|");
  return createHash("sha256").update(material).digest("hex").slice(0, 16);
}

function extractExistingFingerprints(markdown: string): Set<string> {
  const found = new Set<string>();
  const re = /<!--\s*lesson-id:\s*([a-f0-9]{16})\s*-->/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(markdown)) !== null) {
    found.add(m[1]!);
  }
  return found;
}

function formatLessonBlock(event: ResearchEvent, id: string): string {
  const summary = sanitizeLessonText(event.summary);
  const when = event.recordedAt.slice(0, 10);
  const symbol = event.symbol ? ` · \`${event.symbol}\`` : "";
  const tags =
    event.tags && event.tags.length > 0
      ? `\n- **Tags:** ${event.tags.map((t) => "`" + t + "`").join(", ")}`
      : "";
  const url = event.url ? `\n- **URL:** ${event.url}` : "";

  return [
    `### ${when} — ${sanitizeLessonText(event.source)}${symbol}`,
    `<!-- lesson-id: ${id} -->`,
    "",
    summary,
    "",
    `- **Confidence:** medium`,
    `- **Source (engine):** \`${event.source}\``,
    `- **Recorded:** ${event.recordedAt} (as of export)`,
    tags,
    url,
    "",
  ]
    .filter((line) => line !== undefined)
    .join("\n")
    .replace(/\n{3,}/g, "\n\n");
}

function starterDocument(): string {
  const today = new Date().toISOString().slice(0, 10);
  return `---
title: Trading Research Lessons
type: concept
date: ${today}
tags:
  - trading
  - research
  - lessons
  - curated-export
ai-first: true
source-of-truth: decision-engine ResearchMemoryStore (STATE_DIR/research-memory.json)
export: curated-lessons-only
---

# Trading Research Lessons

## For future agent

Curated **process lessons** exported from the Robinhood decision-engine \`ResearchMemoryStore\`. Source of truth remains the engine JSON under \`STATE_DIR\` — this note is a one-way, sanitized digest so other vault agents can reuse lessons without reading operational state. Do **not** put balances, position sizes, order IDs, account numbers, or credentials here.

## Security

- Only \`kind: lesson\` events are exported.
- Text is sanitized before write (amounts, sizes, IDs, emails, secrets, home paths).
- Production MCP server never writes here; export is an explicit local CLI step.
- See [[Agents/Trading Research/_README|Trading Research README]] for the full policy.

## Lessons

`;
}

/**
 * One-way export of sanitized `lesson` events into a vault markdown file.
 * Idempotent: existing `<!-- lesson-id: ... -->` markers are skipped.
 */
export function exportResearchLessons(opts: ExportResearchLessonsOptions): ExportResearchLessonsResult {
  const store = new ResearchMemoryStore(opts.stateDir);
  const all = store.all();
  const lessons = all.filter((e) => e.kind === "lesson");

  mkdirSync(opts.outDir, { recursive: true });
  const outPath = join(opts.outDir, LESSONS_FILENAME);
  const existing = existsSync(outPath) ? readFileSync(outPath, "utf-8") : starterDocument();
  const seen = extractExistingFingerprints(existing);

  const blocks: string[] = [];
  let skippedDuplicates = 0;
  for (const event of lessons) {
    const id = lessonFingerprint(event);
    if (seen.has(id)) {
      skippedDuplicates += 1;
      continue;
    }
    seen.add(id);
    blocks.push(formatLessonBlock(event, id));
  }

  const newlyAppended = blocks.length;
  if (!opts.dryRun && newlyAppended > 0) {
    const next = existing.trimEnd() + "\n\n" + blocks.join("\n") + "\n";
    atomicWriteFileSync(outPath, next);
  } else if (!opts.dryRun && !existsSync(outPath)) {
    atomicWriteFileSync(outPath, starterDocument());
  }

  return {
    sourceEvents: all.length,
    lessonEvents: lessons.length,
    newlyAppended,
    skippedDuplicates,
    outPath,
    dryRun: Boolean(opts.dryRun),
  };
}
