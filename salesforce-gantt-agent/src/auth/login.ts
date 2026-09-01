#!/usr/bin/env tsx
/**
 * One-time interactive login: opens a headed Chromium under the virtual
 * display, lets you log in by hand (including any MFA prompt), then saves
 * the resulting session to SF_AUTH_STATE_PATH once you confirm at the
 * prompt.
 *
 * For environments with no real display or live VNC access to the virtual
 * one, use the assisted-login scripts instead (see
 * scripts/start-assisted-login.ts and scripts/login-action.ts).
 */
import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import readline from "node:readline/promises";
import { loadEnv } from "../config/env.js";
import { startVirtualDisplay, resolveChromiumExecutablePath } from "../display/virtualDisplay.js";

async function main() {
  const env = loadEnv();
  const virtualDisplay = await startVirtualDisplay({
    width: env.VIRTUAL_DISPLAY_WIDTH,
    height: env.VIRTUAL_DISPLAY_HEIGHT,
  });

  const browser = await chromium.launch({ headless: false, executablePath: resolveChromiumExecutablePath() });
  const context = await browser.newContext();

  try {
    const page = await context.newPage();
    await page.goto(env.SF_ORG_URL);
    console.log(`Virtual display: ${virtualDisplay.display}`);
    console.log("Log in (including any MFA prompt) in the opened browser window, then return here.");

    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    await rl.question("Press Enter once you're fully logged in... ");
    rl.close();

    await mkdir(dirname(env.SF_AUTH_STATE_PATH), { recursive: true });
    await context.storageState({ path: env.SF_AUTH_STATE_PATH });
    console.log(`Saved session to ${env.SF_AUTH_STATE_PATH}`);
  } finally {
    await browser.close();
    virtualDisplay.stop();
  }
}

main().catch((err) => {
  console.error("Login failed:", err);
  process.exit(1);
});
