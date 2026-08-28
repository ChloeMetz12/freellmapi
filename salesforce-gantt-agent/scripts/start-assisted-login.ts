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
import { loadEnv } from "../src/config/env.js";
import { startVirtualDisplay } from "../src/display/virtualDisplay.js";

export const CDP_PORT = 9333;

async function main() {
  const env = loadEnv();
  const virtualDisplay = await startVirtualDisplay({
    width: env.VIRTUAL_DISPLAY_WIDTH,
    height: env.VIRTUAL_DISPLAY_HEIGHT,
  });
  console.log(`Virtual display: ${virtualDisplay.display}`);

  const browser = await chromium.launch({
    headless: false,
    args: [`--remote-debugging-port=${CDP_PORT}`, "--remote-debugging-address=127.0.0.1"],
  });
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(env.SF_ORG_URL);

  console.log(`READY cdp=http://127.0.0.1:${CDP_PORT}`);

  // Keep the process (and therefore the browser) alive until killed externally.
  await new Promise(() => {});
}

main().catch((err) => {
  console.error("Failed to start assisted login browser:", err);
  process.exit(1);
});
