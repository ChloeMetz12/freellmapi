import { timingSafeEqual } from "node:crypto";

/**
 * Timing-safe comparison — a shared-secret bearer token must never be
 * checked with `!==`, which leaks a character-by-character timing signal.
 *
 * MUST compare Buffer (byte) length here, not JS string .length: a
 * string's .length counts UTF-16 code units, which can differ from its
 * UTF-8 byte length for multi-byte characters. An earlier version of this
 * function compared string .length before calling timingSafeEqual with
 * UTF-8-encoded Buffers — a same-code-unit-length-but-multi-byte header
 * value could then produce mismatched Buffer lengths, and
 * timingSafeEqual throws (not returns false) on a length mismatch,
 * turning a routine bad-token request into an uncaught exception / 500
 * instead of a clean 401.
 */
export function tokensMatch(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}
