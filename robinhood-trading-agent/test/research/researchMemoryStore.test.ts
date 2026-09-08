import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ResearchMemoryStore } from "../../src/research/researchMemoryStore.js";

let dir: string | undefined;

afterEach(() => {
  if (dir) rmSync(dir, { recursive: true, force: true });
  dir = undefined;
});

describe("ResearchMemoryStore", () => {
  it("persists forum skims and failures across reload", () => {
    dir = mkdtempSync(join(tmpdir(), "research-mem-"));
    const store = new ResearchMemoryStore(dir);
    store.append({ kind: "forum_skim", source: "reddit", summary: "r/wallstreetbets bullish on SMH", symbol: "SMH", tags: ["semis"] });
    store.append({ kind: "search_fail", source: "finviz", summary: "WebFetch timeout", url: "https://finviz.com/screener.ashx" });

    const reloaded = new ResearchMemoryStore(dir);
    expect(reloaded.all()).toHaveLength(2);
    expect(reloaded.recentFailures()).toHaveLength(1);
    expect(reloaded.failureCountsBySource()).toEqual({ finviz: 1 });
  });
});
