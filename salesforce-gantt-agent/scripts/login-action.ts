#!/usr/bin/env tsx
/**
 * Performs a single action against the browser started by
 * start-assisted-login.ts, then screenshots the result and prints a
 * SCREENSHOT:<path> marker (same convention as src/logging/screenshots.ts)
 * so it can be relayed into the chat. Connects fresh over CDP each call
 * and disconnects (not closes) afterward, leaving the long-lived browser
 * running for the next action.
 */
import { chromium, type Page, type BrowserContext } from "playwright";
import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { loadEnv } from "../src/config/env.js";
import { CDP_PORT } from "./start-assisted-login.js";

async function withPage<T>(fn: (page: Page, context: BrowserContext) => Promise<T>): Promise<T> {
  const browser = await chromium.connectOverCDP(`http://127.0.0.1:${CDP_PORT}`);
  try {
    const context = browser.contexts()[0];
    const page = context.pages()[0] ?? (await context.newPage());
    return await fn(page, context);
  } finally {
    await browser.close(); // connectOverCDP: disconnects the client, does not kill the actual browser
  }
}

async function screenshot(page: Page): Promise<void> {
  const path = `/tmp/sf-login-${Date.now()}.png`;
  await page.screenshot({ path });
  console.log(`SCREENSHOT:${path}`);
}

function argVal(args: string[], flag: string): string | undefined {
  const idx = args.indexOf(flag);
  return idx >= 0 ? args[idx + 1] : undefined;
}

async function main() {
  const [, , cmd, ...args] = process.argv;

  switch (cmd) {
    case "goto": {
      const url = args[0];
      if (!url) throw new Error("Usage: goto <url>");
      await withPage(async (page) => {
        await page.goto(url);
        await screenshot(page);
      });
      break;
    }
    case "fill": {
      const label = argVal(args, "--label");
      const value = argVal(args, "--value");
      if (!label || value === undefined) throw new Error("Usage: fill --label <label> --value <value>");
      await withPage(async (page) => {
        await page.getByLabel(label).fill(value);
        await screenshot(page);
      });
      break;
    }
    case "click": {
      const role = argVal(args, "--role");
      const name = argVal(args, "--name");
      if (!role) throw new Error("Usage: click --role <role> [--name <name>]");
      await withPage(async (page) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (page.getByRole as any)(role, name ? { name } : undefined).click();
        await page.waitForTimeout(1500);
        await screenshot(page);
      });
      break;
    }
    case "press": {
      const key = argVal(args, "--key");
      if (!key) throw new Error("Usage: press --key <key>");
      await withPage(async (page) => {
        await page.keyboard.press(key);
        await page.waitForTimeout(1500);
        await screenshot(page);
      });
      break;
    }
    case "screenshot": {
      await withPage(async (page) => {
        await screenshot(page);
      });
      break;
    }
    case "status": {
      await withPage(async (page) => {
        console.log(`URL:${page.url()}`);
      });
      break;
    }
    case "save": {
      const env = loadEnv();
      await withPage(async (_page, context) => {
        await mkdir(dirname(env.SF_AUTH_STATE_PATH), { recursive: true });
        await context.storageState({ path: env.SF_AUTH_STATE_PATH });
        console.log(`SAVED:${env.SF_AUTH_STATE_PATH}`);
      });
      break;
    }
    default:
      throw new Error(`Unknown command: ${cmd}. Expected one of: goto, fill, click, press, screenshot, status, save`);
  }
}

main().catch((err) => {
  console.error(`ERROR: ${(err as Error).message}`);
  process.exit(1);
});
