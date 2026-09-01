import { chromium, type Browser, type BrowserContext } from "playwright";
import { existsSync } from "node:fs";
import type { Env } from "../config/env.js";
import { startVirtualDisplay, resolveChromiumExecutablePath } from "../display/virtualDisplay.js";

export class SessionExpiredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SessionExpiredError";
  }
}

export interface AuthenticatedSession {
  context: BrowserContext;
  close: () => Promise<void>;
}

/**
 * Restores the Playwright storageState saved by `npm run login` (or the
 * assisted-login scripts) into a fresh headed Chromium context -- headed
 * because Salesforce restricts/flags headless sessions, see
 * display/virtualDisplay.ts -- and verifies it's still authenticated by
 * loading the org URL and checking we didn't land on the login page.
 */
export async function openAuthenticatedSession(env: Env): Promise<AuthenticatedSession> {
  if (!existsSync(env.SF_AUTH_STATE_PATH)) {
    throw new SessionExpiredError(
      `No saved Salesforce session found at ${env.SF_AUTH_STATE_PATH}. Run "npm run login" (or the assisted-login scripts) first.`,
    );
  }

  const virtualDisplay = await startVirtualDisplay({ width: env.VIRTUAL_DISPLAY_WIDTH, height: env.VIRTUAL_DISPLAY_HEIGHT });

  let browser: Browser;
  let context: BrowserContext;
  try {
    browser = await chromium.launch({ headless: false, executablePath: resolveChromiumExecutablePath() });
    context = await browser.newContext({ storageState: env.SF_AUTH_STATE_PATH });
  } catch (err) {
    virtualDisplay.stop();
    throw err;
  }

  const close = async (): Promise<void> => {
    await context.close().catch(() => {});
    await browser.close().catch(() => {});
    virtualDisplay.stop();
  };

  try {
    const probe = await context.newPage();
    await probe.goto(env.SF_ORG_URL, { waitUntil: "domcontentloaded" });
    // Lightning's login page always has a labeled Username field; a restored
    // session lands on the app shell instead, where this is never visible.
    const loggedOut = await probe
      .getByLabel(/username/i)
      .first()
      .isVisible()
      .catch(() => false);
    await probe.close();

    if (loggedOut) {
      throw new SessionExpiredError(
        `The saved Salesforce session at ${env.SF_AUTH_STATE_PATH} appears to be expired (landed on the login page). Run "npm run login" again.`,
      );
    }
  } catch (err) {
    await close();
    throw err;
  }

  return { context, close };
}
