# Schedule: Investors.com morning + evening Routines

Arm two Claude Code cloud Routines so the trading orchestrator runs an IBD
research + implement pass twice on weekdays.

## Prerequisites

- Existing dry-run stack: Fly decision-engine + RobinHood Trade connector
- Cloud env: `MCP_AUTH_TOKEN`, network allow for `www.metza12robinhood.com`
- Repo / prompt text: use `docs/orchestration-ibd-am-pm-prompt.md` (inline
  the body into the Routine prompt if the cloud clone lacks this file)

## Create (Claude Code)

In a Claude Code session with `/schedule` available:

```
/schedule
```

Create **two** Routines:

### 1. Morning

- **Title:** `robinhood-ibd-morning`
- **Cron (America/New_York):** `0 8 * * 1-5`
- **Connectors:** RobinHood Trade + decision-engine `.mcp.json`
- **Prompt:** full contents of `docs/orchestration-ibd-am-pm-prompt.md`
  with MODE reminder `dry-run`
- **allowed_tools:** same dry-run set as
  `robinhood-decision-engine dry-run` (include paper position tools,
  research memory, crypto historicals; exclude live `place_*` if the
  platform supports an allowlist)

### 2. Evening

- **Title:** `robinhood-ibd-evening`
- **Cron (America/New_York):** `30 16 * * 1-5`
- **Same connectors / prompt / allowlist** as morning

## Verify

```
/schedule list
```

Confirm both titles, cron strings, and next fire times. After the first
morning run, check decision-engine research memory for
`source: "investors.com"` and tags `ibd-morning`.

## Relationship to hourly Routine

| Routine | When | Job |
|---|---|---|
| `robinhood-decision-engine dry-run` | Hourly 9:30–15:30 ET weekdays | Full trading cycle; also rotates IBD lightly |
| `robinhood-ibd-morning` | 8:00 ET weekdays | Deep IBD skim + seed theses / universe |
| `robinhood-ibd-evening` | 16:30 ET weekdays | Deep IBD skim + lessons + paper cleanup |

Do **not** remove the hourly Routine when adding these two.
