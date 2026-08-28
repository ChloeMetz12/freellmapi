#!/usr/bin/env tsx
/**
 * Starts a long-lived, headed Chromium under the virtual display with a
 * CDP debugging port open, so separate short-lived `login-action.ts`
 * invocations can attach to it and drive it one step at a time. This is
 * the mechanism for an "assisted login" when nobody has a real display or
 * live VNC access to this environment's virtual display: each action's
 * resulting screenshot is relayed back into the chat by whoever is
 * running these scripts.
 *
 * Usage: run this in the background, then drive it with:
 *   tsx scripts/login-action.ts screenshot
 *   tsx scripts/login-action.ts fill --label Username --value "..."
 *   tsx scripts/login-action.ts click --role button --name "Log In"
 *   tsx scripts/login-action.ts press --key Enter
 *   tsx scripts/login-action.ts save
 */
import { chromium } from "playwright";
import { existsSync } from "node:fs";
import { loadEnv } from "../src/config/env.js";
import { startVirtualDisplay, type VirtualDisplay } from "../src/display/virtualDisplay.js";

export const CDP_PORT = 9333;

/**
 * Some sandboxed environments pre-install a Chromium build outside
 * Playwright's normal managed location (and block downloading another one).
 * Prefer that pre-installed build when present; otherwise fall back to
 * Playwright's default resolution (a normal local machine).
 */
function resolveExecutablePath(): string | undefined {
  const override = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
  if (override && existsSync(override)) return override;
  const preinstalled = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
  if (existsSync(preinstalled)) return preinstalled;
  return undefined;
}

async function main() {
  const env = loadEnv();
  let virtualDisplay: VirtualDisplay | undefined;

  try {
    virtualDisplay = await startVirtualDisplay({
      width: env.VIRTUAL_DISPLAY_WIDTH,
      height: env.VIRTUAL_DISPLAY_HEIGHT,
    });
    console.log(`Virtual display: ${virtualDisplay.display}`);

    const browser = await chromium.launch({
      headless: false,
      executablePath: resolveExecutablePath(),
      args: [`--remote-debugging-port=${CDP_PORT}`, "--remote-debugging-address=127.0.0.1"],
    });
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto(env.SF_ORG_URL);

    console.log(`READY cdp=http://127.0.0.1:${CDP_PORT}`);

    // Keep the process (and therefore the browser) alive until killed externally.
    await new Promise(() => {});
  } catch (err) {
    virtualDisplay?.stop();
    throw err;
  }
}

main().catch((err) => {
  console.error("Failed to start assisted login browser:", err);
  process.exit(1);
});
