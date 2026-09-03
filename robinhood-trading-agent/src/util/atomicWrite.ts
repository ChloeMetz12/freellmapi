import { writeFileSync, renameSync } from "node:fs";

/**
 * Writes `content` to `filePath` via write-to-temp-then-rename, which
 * POSIX guarantees is atomic: a reader of `filePath` always sees either
 * the complete previous content or the complete new content, never a
 * partial write. A process killed mid-write (crash, OOM, container
 * restart) can otherwise leave a persisted state file half-written,
 * corrupting it — for `SafetyStateStore` specifically that would trigger
 * an avoidable fail-closed halt on next boot for a reason unrelated to
 * any real risk event.
 */
export function atomicWriteFileSync(filePath: string, content: string): void {
  const tmpPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  writeFileSync(tmpPath, content);
  renameSync(tmpPath, filePath);
}
