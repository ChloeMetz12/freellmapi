import { describe, expect, it } from "vitest";
import type { Page } from "playwright";
import { isOnLoginPage } from "../../src/auth/loginDetection.js";

class TimeoutError extends Error {
  constructor(message = "Timeout waiting for element") {
    super(message);
    this.name = "TimeoutError";
  }
}

function fakePage(url: string, waitFor: () => Promise<void>): Page {
  return {
    getByLabel: () => ({
      first: () => ({ waitFor }),
    }),
    url: () => url,
  } as unknown as Page;
}

describe("isOnLoginPage", () => {
  it("returns true when the Username field is visible", async () => {
    const page = fakePage("https://myorg.my.salesforce.com/login", async () => {});
    await expect(isOnLoginPage(page)).resolves.toBe(true);
  });

  it("returns true on a login.salesforce.com host even without the field appearing (different form layout)", async () => {
    const page = fakePage("https://login.salesforce.com/", async () => {
      throw new TimeoutError();
    });
    await expect(isOnLoginPage(page)).resolves.toBe(true);
  });

  it("returns true on a test.salesforce.com (sandbox) host", async () => {
    const page = fakePage("https://test.salesforce.com/", async () => {
      throw new TimeoutError();
    });
    await expect(isOnLoginPage(page)).resolves.toBe(true);
  });

  it("returns true when the path looks like /login or /authorize even on a different host", async () => {
    const page = fakePage("https://myorg.my.salesforce.com/login?ec=302", async () => {
      throw new TimeoutError();
    });
    await expect(isOnLoginPage(page)).resolves.toBe(true);
  });

  it("does not match a hostname that merely contains 'login' as a substring", async () => {
    const page = fakePage("https://nonlogin.my.salesforce.com/lightning/r/Account/001/view", async () => {
      throw new TimeoutError();
    });
    await expect(isOnLoginPage(page)).resolves.toBe(false);
  });

  it("returns false on a normal authenticated app URL", async () => {
    const page = fakePage("https://myorg.lightning.force.com/lightning/r/Account/001/view", async () => {
      throw new TimeoutError();
    });
    await expect(isOnLoginPage(page)).resolves.toBe(false);
  });

  it("re-throws a non-timeout error instead of treating it as logged in", async () => {
    const page = fakePage("https://myorg.lightning.force.com/", async () => {
      throw new Error("Target closed");
    });
    await expect(isOnLoginPage(page)).rejects.toThrow("Target closed");
  });
});
