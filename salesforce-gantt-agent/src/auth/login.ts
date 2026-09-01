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
import { chromium, type Browser } from "playwright";
import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import readline from "node:readline/promises";
import { loadEnv } from "../config/env.js";
import { startVirtualDisplay, resolveChromiumExecutablePath } from "../display/virtualDisplay.js";
import { isOnLoginPage } from "./loginDetection.js";

async function main() {
  const env = loadEnv();
  const virtualDisplay = await startVirtualDisplay({
    width: env.VIRTUAL_DISPLAY_WIDTH,
    height: env.VIRTUAL_DISPLAY_HEIGHT,
  });

  let browser: Browser | undefined;
  try {
    browser = await chromium.launch({ headless: false, executablePath: resolveChromiumExecutablePath() });

    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto(env.SF_ORG_URL);
    console.log(`Virtual display: ${virtualDisplay.display}`);
    console.log("Log in (including any MFA prompt) in the opened browser window, then return here.");

    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    try {
      await rl.question("Press Enter once you're fully logged in... ");
    } finally {
      rl.close();
    }

    // Confirm we're actually past the login form before persisting
    // storageState -- a premature Enter would otherwise silently save an
    // unauthenticated session that only fails later, at run time.
    const loggedOut = await isOnLoginPage(page, 3000).catch(() => true);
    if (loggedOut) {
      throw new Error("Still on the login page -- log in fully (including any MFA prompt) before pressing Enter. Session was NOT saved.");
    }

    await mkdir(dirname(env.SF_AUTH_STATE_PATH), { recursive: true });
    await context.storageState({ path: env.SF_AUTH_STATE_PATH });
    console.log(`Saved session to ${env.SF_AUTH_STATE_PATH}`);
  } finally {
    await browser?.close();
    virtualDisplay.stop();
  }
}

main().catch((err) => {
  console.error("Login failed:", err);
  process.exit(1);
});
