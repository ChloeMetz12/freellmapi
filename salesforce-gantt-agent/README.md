# salesforce-gantt-agent

An on-demand agent that adds a single, explicitly-named project to Salesforce
Field Service's **Classic Dispatch Console** (Gantt schedule): it creates the
Install Work Order, fills in its fields, and attempts automatic technician
assignment via "Get Candidates." If a technician can't be assigned, it stops
and emails you rather than guessing a drag-and-drop placement.

This tool is **strictly on-demand** — it never runs on a schedule, watches
for new projects, or batch-processes anything. It only acts when you (or an
LLM on your behalf) explicitly name a project in a chat, via the
`add_gantt_project` MCP tool or the CLI.

It is fully self-contained: it has no dependency on the rest of the
`freellmapi` monorepo and is not part of its npm workspaces, so it can be
copied out into its own repository at any time.

## Why browser automation, and why a virtual display

This drives the actual Salesforce Lightning/Classic Dispatch Console UI with
[Playwright](https://playwright.dev/), rather than the Salesforce REST API,
because the Gantt board's drag-and-drop scheduling and "Get Candidates"
ranking have no clean, documented API equivalent to rely on.

**Salesforce restricts/flags headless browser sessions.** Every run —
`npm run login` and normal operation alike — starts a real [Xvfb](https://www.x.org/releases/X11R7.6/doc/man/man1/Xvfb.1.xhtml)
virtual framebuffer and launches Chromium in headed mode against it
(`headless: false`), never truly headless. This is why the host running this
tool needs **Xvfb installed as a system dependency** — `npm install` alone
won't provide it:

```bash
sudo apt-get install xvfb   # Debian/Ubuntu
```

## Setup

1. Install dependencies:
   ```bash
   cd salesforce-gantt-agent
   npm install
   ```
2. Copy `.env.example` to `.env` and fill in:
   - `SF_ORG_URL` — your Salesforce org login URL.
   - `SF_USER_DISPLAY_NAME` — your name exactly as it appears in Salesforce (used as the Work Order's Owner/Dispatcher).
   - `ESCALATION_EMAIL_TO` / `ESCALATION_EMAIL_FROM` / `SMTP_*` — for the "needs manual assignment" alert email (sent to you only).
3. **Run the discovery phase before anything else** (see below) and fill in `src/config/selectors.ts` with real values from your org.
4. Log in once:
   ```bash
   npm run login
   ```
   This opens a headed browser under the virtual display. Because there's no
   physical monitor attached to a server's Xvfb display, you'll need either:
   - to run `login` on a machine with a real display and copy the resulting
     `auth/storageState.json` to wherever the agent actually runs, or
   - to point a VNC viewer at the Xvfb display while `login` runs (e.g.
     `x11vnc -display :99` on the host, then connect a VNC client).

   Complete Salesforce login (including MFA) in that browser, then press
   Enter in the terminal. The session is saved to `auth/storageState.json`
   (gitignored — never commit it) and reused by every later run. When it
   expires, `npm run login` again.

## Discovery phase — do this before trusting anything in `live` mode

Every Salesforce-specific selector in `src/config/selectors.ts` was
transcribed from a training-meeting transcript, not verified against a real
org (no sandbox was available while this tool was built — see "No sandbox"
below). Before running in `live` mode:

```bash
npx playwright codegen <your-org-login-url>
```

Run this against production, off-hours, under the virtual display (or on a
machine with a real display), and manually walk the full flow once: open a
project record → click "Install Work Order" → New → Save → set the Work
Order's Owner/Dispatcher/Type/Territory/Date/Description → Save →
click "Get Candidates" → observe both a successful ranked result and a
failed/empty one if you can reproduce it → right-click the appointment →
Dispatched → reload.

Capture the real role/label/text locators codegen records, the actual
Classic Dispatch Console URL/DOM structure, the Work Order Type picklist's
battery/install sub-options, the real service territory picklist values,
and what "Get Candidates returns nothing" vs. "errors outright" look like in
the DOM (both currently map to the same `NeedsManualAssignment` outcome —
confirm during discovery whether they need different handling). Replace
every placeholder in `src/config/selectors.ts` with what you find — that
file is the single place org-specific UI strings live.

## Watching a run without a real display (no live VNC available)

There's no physical monitor on the virtual display, and — if you're running
this from inside a sandboxed remote session like Claude Code on the web —
there's typically no way to expose a live VNC/remote-desktop stream to your
browser from that environment either. Instead, every screenshot capture
(`src/logging/screenshots.ts`) prints a marker line to stdout:

```
SCREENSHOT:/absolute/path/to/runs/<run-id>/<step>.png
```

Whoever launches the CLI or MCP server can tail stdout for these lines and
surface each screenshot as soon as it's written — e.g. a Claude session
running the tool for you can watch its own process output and post each
screenshot back into your conversation as the run progresses, giving you a
step-by-step (if not perfectly live) view of what's happening. This applies
to normal `add-project` runs; it does **not** cover the one-time
`npm run login` step (see above) — that step should be done somewhere you
already have a real display, specifically so your Salesforce credentials
never have to be typed into a chat session.

**Network policy note:** some sandboxed remote sessions (e.g. Claude Code
on the web, depending on how the environment was configured) block outbound
connections to arbitrary internet hosts, including `*.salesforce.com`,
entirely at the network policy level — not just as a proxy/certificate
issue. `scripts/start-assisted-login.ts` and `scripts/login-action.ts` exist
to help drive the one-time login step from such a session when a real
display or VNC access isn't available, but if the session's network policy
denies Salesforce outright (a proxy returning 403 on the CONNECT to
`login.salesforce.com`, in an environment using this kind of policy-enforcing
egress proxy), no browser automation trick works around that — the
discovery phase, login, and every live run need to happen somewhere with
actual network access to your Salesforce org (your own machine, or a remote
environment whose network policy allows it).

## No sandbox — testing happens carefully against production

There is no Salesforce sandbox available, so `dry-run` mode (the default)
and the confirmation gate in front of the irreversible "Dispatched" status
change are load-bearing, not optional conveniences. Follow
`test/manual-checklist.md` end to end — starting with dry runs, then a
single live run on a low-risk/disposable real customer record — before
trusting this tool broadly. (If you already have a specific customer record
in mind to use as that first live test, use it for checklist step 3.)

## Usage

**As an MCP tool** (so any Claude session can call it by naming a project):
```bash
npm run mcp
```
Then point your MCP client config (Claude Desktop, Claude Code, etc.) at
this server. Two tools are exposed:
- `add_gantt_project` — only `projectIdentifier` is required; everything
  else is scraped off the source project record first and only requested
  from the caller if it can't be reliably extracted.
- `confirm_dispatch` — approves or cancels a run left in `PendingConfirmation`
  (live mode only; dry runs never need this).

**As a CLI**, for testing without an LLM in the loop:
```bash
npm run cli -- add-project --project "Daryl Van Horn" --dry-run
```

## Audit trail

Every run writes screenshots and a JSON manifest (input, extracted/resolved
fields, per-step outcome) to `runs/<timestamp>-<id>/` — gitignored, local
only. Review these after any run, especially a live one.

## Open risks / assumptions

- Selectors, the Dispatch Console's URL/DOM structure, and Lightning vs.
  legacy Classic UI are unverified until the discovery phase runs.
- Salesforce session/MFA timeout cadence is unknown; `npm run login`
  frequency is a guess until observed in practice.
- "Get Candidates returns nothing" and "errors outright" are currently
  handled identically (both → `NeedsManualAssignment`) — confirm during
  discovery whether a third state (e.g. a retryable timeout) is worth
  distinguishing.
- The pre-existing separate calendar mentioned in the training is untouched
  by this tool by design — it must keep being maintained manually in
  parallel.
