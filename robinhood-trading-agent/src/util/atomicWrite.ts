import { renameSync, unlinkSync, openSync, closeSync, writeFileSync, fsyncSync } from "node:fs";
import { dirname } from "node:path";

/**
 * Writes `content` to `filePath` via write-to-temp-then-rename, which
 * POSIX guarantees is atomic: a reader of `filePath` always sees either
 * the complete previous content or the complete new content, never a
 * partial write. A process killed mid-write (crash, OOM, container
 * restart) can otherwise leave a persisted state file half-written,
 * corrupting it — for `SafetyStateStore` specifically that would trigger
 * an avoidable fail-closed halt on next boot for a reason unrelated to
 * any real risk event.
 *
 * Also fsyncs the temp file before rename and the containing directory
 * after — atomicity alone doesn't guarantee durability: without an
 * fsync, the OS can still lose the write entirely (not just partially)
 * if the process/host crashes shortly after, since a normal write can
 * sit in a page-cache buffer rather than reach disk. For safety/
 * kill-switch state, losing the most recent write on crash is worse than
 * the (small, synchronous) cost of fsyncing it.
 */
export function atomicWriteFileSync(filePath: string, content: string): void {
  const tmpPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;

  const fd = openSync(tmpPath, "w");
  try {
    writeFileSync(fd, content);
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }

  try {
    renameSync(tmpPath, filePath);
  } catch (err) {
    // Best-effort cleanup so a rename failure (permissions, transient IO,
    // cross-device rename) doesn't leave stray *.tmp files accumulating
    // on disk — the original error is what the caller needs to see, so
    // swallow any failure from the cleanup itself.
    try {
      unlinkSync(tmpPath);
    } catch {
      // ignore
    }
    throw err;
  }

  // Best-effort: fsync the containing directory so the rename itself is
  // durable, not just the file's content. Directory fsync isn't
  // supported on every platform (notably Windows) — failure here doesn't
  // undo the write, which already succeeded and is the primary guarantee.
  try {
    const dirFd = openSync(dirname(filePath), "r");
    try {
      fsyncSync(dirFd);
    } finally {
      closeSync(dirFd);
    }
  } catch {
    // ignore — best-effort only
  }
}
