import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync, rmSync, readFileSync, existsSync, readdirSync } from "node:fs";
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
});
