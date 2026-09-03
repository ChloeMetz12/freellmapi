import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const ORIGINAL_ENV = { ...process.env };

async function loadEnvFresh() {
  vi.resetModules();
  const mod = await import("../../src/config/env.js");
  return mod.loadEnv();
}

describe("MARGIN_ENABLED parsing", () => {
  beforeEach(() => {
    // Vitest itself sets process.env.MODE="test" (mirroring Vite's own
    // convention) — override it, since our app's MODE has a different,
    // unrelated meaning ("dry-run" | "live").
    process.env = { ...ORIGINAL_ENV, MCP_AUTH_TOKEN: "test-token", MODE: "dry-run" };
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it("defaults to true when unset", async () => {
    delete process.env.MARGIN_ENABLED;
    const env = await loadEnvFresh();
    expect(env.MARGIN_ENABLED).toBe(true);
  });

  it("parses 'true' as true", async () => {
    process.env.MARGIN_ENABLED = "true";
    const env = await loadEnvFresh();
    expect(env.MARGIN_ENABLED).toBe(true);
  });

  it("parses 'false' as false — NOT true (this was the bug: z.coerce.boolean() treats any non-empty string, 'false' included, as true)", async () => {
    process.env.MARGIN_ENABLED = "false";
    const env = await loadEnvFresh();
    expect(env.MARGIN_ENABLED).toBe(false);
  });

  it("rejects an unrecognized value rather than silently coercing it", async () => {
    process.env.MARGIN_ENABLED = "nope";
    await expect(loadEnvFresh()).rejects.toThrow();
  });
});
