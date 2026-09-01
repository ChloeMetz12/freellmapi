import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

export interface VirtualDisplay {
  display: string;
  stop: () => void;
}

/**
 * Salesforce restricts/flags headless browser sessions, so this tool never
 * launches Playwright with `headless: true`. Instead every entry point
 * (login, CLI, MCP tool calls) starts a real Xvfb virtual framebuffer and
 * runs a headed browser against it -- indistinguishable from a normal
 * desktop session as far as Salesforce is concerned.
 *
 * Requires the `Xvfb` binary to be installed as a system dependency
 * (e.g. `apt-get install xvfb`) -- this is not something npm can install.
 */
export async function startVirtualDisplay(options: { width: number; height: number }): Promise<VirtualDisplay> {
  if (process.platform !== "linux") {
    // Xvfb is a Linux/X11 tool and isn't installable on macOS/Windows --
    // but those platforms already have a real display, so headed Chromium
    // just opens a normal visible window with no DISPLAY env var involved.
    return { display: "", stop: () => {} };
  }

  if (process.env.DISPLAY && (await isDisplayLive(process.env.DISPLAY))) {
    // Already running under a real or externally-managed virtual display
    // (e.g. a dev machine, or an outer xvfb-run wrapper) -- reuse it.
    return { display: process.env.DISPLAY, stop: () => {} };
  }

  const displayNumber = pickFreeDisplayNumber();
  const display = `:${displayNumber}`;

  // spawn() does not throw synchronously for a missing binary (ENOENT) --
  // that surfaces asynchronously as an "error" event. Wait for either the
  // display becoming ready or that event, and kill the process on any
  // failure path (including waitForDisplay's own timeout) so it doesn't
  // linger as an orphan.
  const proc: ChildProcess = spawn("Xvfb", [display, "-screen", "0", `${options.width}x${options.height}x24`, "-nolisten", "tcp"], {
    stdio: "ignore",
  });

  await new Promise<void>((resolve, reject) => {
    let settled = false;

    const onSpawnError = (err: Error) => {
      if (settled) return;
      settled = true;
      reject(
        new Error(
          `Failed to start Xvfb (virtual display). Salesforce requires a headed browser, so Xvfb must be installed ` +
            `as a system dependency (e.g. "sudo apt-get install xvfb"). Original error: ${err.message}`,
        ),
      );
    };
    proc.once("error", onSpawnError);

    waitForDisplay(display)
      .then(() => {
        if (settled) return;
        settled = true;
        proc.off("error", onSpawnError);
        resolve();
      })
      .catch((err) => {
        if (settled) return;
        settled = true;
        reject(err);
      });
  }).catch((err) => {
    proc.kill();
    throw err;
  });

  process.env.DISPLAY = display;
  // Prevent an uncaught exception if Xvfb dies after a successful startup --
  // stop() is still the caller's responsibility for a clean shutdown.
  proc.on("error", (err) => {
    console.error(`Xvfb process error after startup: ${err.message}`);
  });

  return {
    display,
    stop: () => {
      proc.kill();
    },
  };
}

/**
 * Some sandboxed environments pre-install a Chromium build outside
 * Playwright's normal managed location (and block downloading another one).
 * Prefer that pre-installed build when present; otherwise fall back to
 * Playwright's default resolution (a normal local machine).
 *
 * The pre-installed directory holds a revision-specific `chromium-<rev>`
 * folder, so instead of hardcoding a version we discover it at runtime --
 * this avoids silently preferring a stale, mismatched binary over
 * Playwright's managed build after a Playwright version bump. This fallback
 * is enabled by default whenever the directory exists (directory
 * configurable via PLAYWRIGHT_PREINSTALLED_CHROMIUM_DIR, default
 * /opt/pw-browsers) -- set PLAYWRIGHT_USE_PREINSTALLED_CHROMIUM=0 to opt out
 * (e.g. on a normal machine that happens to have something at that path but
 * should still use Playwright's own managed browser).
 */
export function resolveChromiumExecutablePath(): string | undefined {
  const override = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
  if (override && existsSync(override)) return override;

  if (process.env.PLAYWRIGHT_USE_PREINSTALLED_CHROMIUM === "0") return undefined;

  const baseDir = process.env.PLAYWRIGHT_PREINSTALLED_CHROMIUM_DIR ?? "/opt/pw-browsers";
  if (!existsSync(baseDir)) return undefined;

  let entries: string[];
  try {
    entries = readdirSync(baseDir);
  } catch {
    // Path exists but isn't a readable directory (ENOTDIR/EACCES/etc) --
    // fall back to Playwright's default resolution instead of throwing.
    return undefined;
  }

  const revisions = entries
    .map((entry) => /^chromium-(\d+)$/.exec(entry))
    .filter((match): match is RegExpExecArray => match !== null)
    .sort((a, b) => Number(b[1]) - Number(a[1]));

  for (const match of revisions) {
    const candidate = join(baseDir, match[0], "chrome-linux", "chrome");
    if (existsSync(candidate)) return candidate;
  }

  return undefined;
}

function pickFreeDisplayNumber(): number {
  for (let n = 99; n < 199; n++) {
    if (!existsSync(`/tmp/.X${n}-lock`)) return n;
  }
  throw new Error("No free X display number found in range :99-:198");
}

async function isDisplayLive(display: string): Promise<boolean> {
  const match = display.match(/^:(\d+)/);
  if (!match) return false;
  return existsSync(`/tmp/.X${match[1]}-lock`);
}

async function waitForDisplay(display: string, timeoutMs = 5000): Promise<void> {
  const match = display.match(/^:(\d+)/);
  const lockFile = match ? `/tmp/.X${match[1]}-lock` : undefined;
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (lockFile && existsSync(lockFile)) return;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`Timed out waiting for Xvfb to start on display ${display}`);
}
