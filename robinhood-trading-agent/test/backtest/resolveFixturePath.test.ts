import { describe, it, expect, afterEach } from "vitest";
import { fileURLToPath } from "node:url";
import { dirname, join, isAbsolute } from "node:path";
import { resolveFixturePath } from "../../backtest/run.js";

// This test lives at <repo>/test/backtest/, so the repo root is three dirs up;
// run.ts resolves its default fixture relative to <repo>/backtest/.
const repoRoot = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const defaultFixture = join(repoRoot, "backtest", "fixtures", "sample-ohlcv.json");

describe("resolveFixturePath", () => {
  const originalEnv = process.env.BACKTEST_FIXTURE;

  afterEach(() => {
    if (originalEnv === undefined) delete process.env.BACKTEST_FIXTURE;
    else process.env.BACKTEST_FIXTURE = originalEnv;
  });

  it("falls back to the bundled sample fixture when no arg or env var is set", () => {
    delete process.env.BACKTEST_FIXTURE;
    expect(resolveFixturePath(undefined)).toBe(defaultFixture);
  });

  it("uses an explicit relative arg, resolved against the current working directory", () => {
    delete process.env.BACKTEST_FIXTURE;
    const resolved = resolveFixturePath("backtest/fixtures/extended-ohlcv.json");
    expect(resolved).toBe(join(process.cwd(), "backtest/fixtures/extended-ohlcv.json"));
    expect(isAbsolute(resolved)).toBe(true);
  });

  it("uses an absolute arg as-is", () => {
    const abs = "/tmp/some/custom-fixture.json";
    expect(resolveFixturePath(abs)).toBe(abs);
  });

  it("falls back to BACKTEST_FIXTURE when no arg is given", () => {
    process.env.BACKTEST_FIXTURE = "/data/env-fixture.json";
    expect(resolveFixturePath(undefined)).toBe("/data/env-fixture.json");
  });

  it("prefers an explicit arg over the BACKTEST_FIXTURE env var", () => {
    process.env.BACKTEST_FIXTURE = "/data/env-fixture.json";
    expect(resolveFixturePath("/data/arg-fixture.json")).toBe("/data/arg-fixture.json");
  });
});
