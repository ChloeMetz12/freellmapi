import { spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";

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
  if (process.env.DISPLAY && (await isDisplayLive(process.env.DISPLAY))) {
    // Already running under a real or externally-managed virtual display
    // (e.g. a dev machine, or an outer xvfb-run wrapper) -- reuse it.
    return { display: process.env.DISPLAY, stop: () => {} };
  }

  const displayNumber = pickFreeDisplayNumber();
  const display = `:${displayNumber}`;

  let proc: ChildProcess;
  try {
    proc = spawn("Xvfb", [display, "-screen", "0", `${options.width}x${options.height}x24`, "-nolisten", "tcp"], {
      stdio: "ignore",
    });
  } catch (err) {
    throw new Error(
      `Failed to start Xvfb (virtual display). Salesforce requires a headed browser, so Xvfb must be installed ` +
        `as a system dependency (e.g. "sudo apt-get install xvfb"). Original error: ${(err as Error).message}`,
    );
  }

  proc.on("error", (err) => {
    throw new Error(`Xvfb process error: ${err.message}. Is Xvfb installed on this host?`);
  });

  await waitForDisplay(display);
  process.env.DISPLAY = display;

  return {
    display,
    stop: () => {
      proc.kill();
    },
  };
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
