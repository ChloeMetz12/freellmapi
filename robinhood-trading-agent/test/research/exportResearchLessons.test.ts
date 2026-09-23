import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync, rmSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ResearchMemoryStore } from "../../src/research/researchMemoryStore.js";
import { sanitizeLessonText } from "../../src/research/sanitizeLessonText.js";
import { exportResearchLessons, LESSONS_FILENAME } from "../../src/research/exportResearchLessons.js";

let dirs: string[] = [];

afterEach(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
  dirs = [];
});

function tempDir(prefix: string): string {
  const d = mkdtempSync(join(tmpdir(), prefix));
  dirs.push(d);
  return d;
}

describe("sanitizeLessonText", () => {
  it("redacts balances, sizes, emails, and secrets", () => {
    const raw =
      "Bought 100 shares of SMH; equity $12,345.67; account_number 123456789; email me@example.com; api_key=sk-abc123";
    const out = sanitizeLessonText(raw);
    expect(out).not.toMatch(/\$12/);
    expect(out).not.toMatch(/100 shares/i);
    expect(out).not.toMatch(/123456789/);
    expect(out).not.toMatch(/me@example/);
    expect(out).not.toMatch(/sk-abc123/);
    expect(out).toMatch(/\[amount\]|\[redacted/);
  });
});

describe("exportResearchLessons", () => {
  it("exports only lessons, sanitized, and is idempotent", () => {
    const stateDir = tempDir("research-export-state-");
    const outDir = tempDir("research-export-out-");
    const store = new ResearchMemoryStore(stateDir);
    store.append({
      kind: "forum_skim",
      source: "reddit",
      summary: "noisy skim with $999 equity mention",
      symbol: "SMH",
    });
    store.append({
      kind: "lesson",
      source: "self",
      summary: "Do not retry finviz after 2 timeouts; prior SMH thesis failed — not because of $500 PnL",
      symbol: "SMH",
      tags: ["semis", "process"],
    });

    const first = exportResearchLessons({ stateDir, outDir });
    expect(first.lessonEvents).toBe(1);
    expect(first.newlyAppended).toBe(1);
    expect(first.sourceEvents).toBe(2);

    const md = readFileSync(join(outDir, LESSONS_FILENAME), "utf-8");
    expect(md).toContain("Do not retry finviz");
    expect(md).not.toContain("$500");
    expect(md).toContain("<!-- lesson-id:");
    expect(md).not.toContain("noisy skim");

    const second = exportResearchLessons({ stateDir, outDir });
    expect(second.newlyAppended).toBe(0);
    expect(second.skippedDuplicates).toBe(1);
  });

  it("dry-run does not create Lessons.md when empty lessons", () => {
    const stateDir = tempDir("research-export-dry-state-");
    const outDir = tempDir("research-export-dry-out-");
    const result = exportResearchLessons({ stateDir, outDir, dryRun: true });
    expect(result.dryRun).toBe(true);
    expect(existsSync(join(outDir, LESSONS_FILENAME))).toBe(false);
  });
});
