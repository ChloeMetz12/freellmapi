import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync, rmSync, readFileSync, existsSync, readdirSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { atomicWriteFileSync } from "../../src/util/atomicWrite.js";

let dir: string | undefined;

afterEach(() => {
  if (dir) rmSync(dir, { recursive: true, force: true });
  dir = undefined;
});

describe("atomicWriteFileSync", () => {
  it("writes the file with the given content", () => {
    dir = mkdtempSync(join(tmpdir(), "atomic-write-"));
    const filePath = join(dir, "test.json");
    atomicWriteFileSync(filePath, '{"a":1}');
    expect(readFileSync(filePath, "utf-8")).toBe('{"a":1}');
  });

  it("overwrites existing content cleanly, leaving no temp file behind", () => {
    dir = mkdtempSync(join(tmpdir(), "atomic-write-"));
    const filePath = join(dir, "test.json");
    atomicWriteFileSync(filePath, '{"a":1}');
    atomicWriteFileSync(filePath, '{"a":2}');
    expect(readFileSync(filePath, "utf-8")).toBe('{"a":2}');
    expect(readdirSync(dir)).toEqual(["test.json"]);
  });

  it("never leaves only a partial/temp file if the target didn't exist before", () => {
    dir = mkdtempSync(join(tmpdir(), "atomic-write-"));
    const filePath = join(dir, "test.json");
    atomicWriteFileSync(filePath, "content");
    expect(existsSync(filePath)).toBe(true);
    expect(readdirSync(dir)).toEqual(["test.json"]);
  });

  it("cleans up the temp file if the rename itself fails, instead of leaving it behind", () => {
    dir = mkdtempSync(join(tmpdir(), "atomic-write-"));
    // Renaming a file onto an existing directory always fails (EISDIR/
    // ENOTDIR) — a reliable way to force renameSync to throw without
    // mocking fs internals.
    const targetPath = join(dir, "target");
    mkdirSync(targetPath);

    expect(() => atomicWriteFileSync(targetPath, "content")).toThrow();
    // Only the pre-existing "target" directory should remain — no stray *.tmp file.
    expect(readdirSync(dir)).toEqual(["target"]);
  });
});
