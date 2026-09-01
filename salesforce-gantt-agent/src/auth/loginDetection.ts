import type { Page } from "playwright";

/**
 * Determines whether `page` is currently showing the Salesforce login form.
 *
 * Lightning's login page always has a labeled Username field; an
 * authenticated session lands on the app shell instead, where this is never
 * visible. Uses an auto-waiting check (rather than a single isVisible()
 * snapshot) since the login form can render, or the page can redirect,
 * shortly after the initial navigation resolves.
 *
 * Shared by session.ts (post-restore verification) and login.ts (pre-save
 * verification) so both call sites agree on what "still on the login page"
 * means.
 */
export async function isOnLoginPage(page: Page, timeoutMs = 5000): Promise<boolean> {
  try {
    await page
      .getByLabel(/username/i)
      .first()
      .waitFor({ state: "visible", timeout: timeoutMs });
    return true;
  } catch (err) {
    if (err instanceof Error && err.name === "TimeoutError") {
      // Username field never appeared -- treat as logged in, but also
      // double-check we didn't land on a login/authorize host (by hostname,
      // not just path/query) under a different form layout.
      const url = new URL(page.url());
      const isLoginHost = /(^|\.)(login|test)\.salesforce\.com$/i.test(url.hostname);
      const isLoginPath = /\/(login|authorize)(\/|$|\?)/i.test(url.pathname + url.search);
      return isLoginHost || isLoginPath;
    }
    // A real navigation/strict-mode/target-closed error -- don't silently
    // reinterpret this as a healthy session.
    throw err;
  }
}
