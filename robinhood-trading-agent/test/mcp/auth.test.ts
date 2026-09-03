import { describe, it, expect } from "vitest";
import { tokensMatch } from "../../src/mcp/auth.js";

describe("tokensMatch", () => {
  it("returns true for identical tokens", () => {
    expect(tokensMatch("abc123", "abc123")).toBe(true);
  });

  it("returns false for different tokens of the same length", () => {
    expect(tokensMatch("abc123", "xyz789")).toBe(false);
  });

  it("returns false (not throws) for tokens of different lengths", () => {
    expect(() => tokensMatch("short", "a-much-longer-token")).not.toThrow();
    expect(tokensMatch("short", "a-much-longer-token")).toBe(false);
  });

  it("returns false (not throws) for a multi-byte string with the same UTF-16 .length as the real token but a different UTF-8 byte length", () => {
    // "café" has 4 UTF-16 code units (same as e.g. "abcd") but 5 UTF-8
    // bytes — exactly the mismatch that broke a string-.length-based
    // pre-check in an earlier version of this function.
    const real = "abcd";
    const attacker = "café";
    expect(real.length).toBe(attacker.length);
    expect(() => tokensMatch(attacker, real)).not.toThrow();
    expect(tokensMatch(attacker, real)).toBe(false);
  });
});
