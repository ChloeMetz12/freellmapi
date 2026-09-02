# robinhood-trading-agent

A decision-engine MCP server for an autonomous, self-learning Robinhood
day-trading agent: candlestick-pattern + technical-indicator + news/market
sentiment strategy, bounded online self-learning, and the daily-loss /
margin-call / pattern-day-trader safety guardrails that keep it from
blowing up the account it's trading with.

**This package never places a trade itself.** See "Architecture" below —
it can't.

It is fully self-contained: it has no dependency on the rest of the
`freellmapi` monorepo and is not part of its npm workspaces, so it can be
copied out into its own repository at any time (matching the
`salesforce-gantt-agent/` package alongside it).

## The configuration this was built for

This agent was explicitly requested and configured for the highest-risk
setup available, confirmed over several rounds of questions before any code
was written:

| Parameter | Configuration |
|---|---|
| Execution | Fully autonomous — no per-trade human approval, intraday day trading |
| Learning | Fully autonomous online learning — signal weights adapt in production, no human gate before a change takes effect |
| Position sizing | No hard per-trade cap — confidence- and volatility-scaled, can use full available buying power |
| Daily loss kill-switch | Hard halt at **10% of account equity lost in a day** (`DAILY_LOSS_HALT_PCT`) |
| Asset universe | Equities + crypto + **margin/leverage** |
| Decision inputs | Candlestick patterns + technical indicators + market-trend and world-news sentiment |

If that's not the configuration you want, **do not just flip `MODE=live`** —
re-read "Open risks" below first, and see `src/config/riskLimits.ts` /
`.env.example` for what's actually tunable.

## Architecture

### Why this package can't call Robinhood itself

`agent.robinhood.com/mcp/trading`'s OAuth authorization is scoped to a
Claude session/account (via `claude mcp` / `/mcp`, or a claude.ai connector),
not exportable as a bearer token a separate standalone Node process can hold
and call directly. That rules out the simplest shape (a bare `npm start`
daemon that itself calls Robinhood's tools, the way `salesforce-gantt-agent`
calls Salesforce via its own Playwright session) — **only a Claude session
that has the `RobinHood_Trade` connector attached can call `get_quote`,
`place_order`, etc.**

So the architecture splits in two:

1. **This package** — a small always-on **MCP server** (`npm run mcp`)
   exposing the deterministic strategy/safety/learning computation as
   tools: `get_sentiment`, `compute_decision`, `check_safety`, `size_order`,
   `record_outcome`, `generate_reflection`, `halt`, `resume`, `get_status`.
   It fetches its own news (Finnhub, NewsAPI — see below) and calls an LLM
   for sentiment reasoning, but it never touches Robinhood.
2. **A persistent Claude Code Remote session** that holds the authorized
   `RobinHood_Trade` connector *and* this server as an MCP connection. A
   cron Routine (`create_trigger`) wakes it every 1-5 minutes during market
   hours; each firing it: calls `RobinHood_Trade`'s data tools for fresh
   OHLCV/account state → calls this server's `compute_decision` → calls
   `check_safety` → if clear, calls `size_order` then `RobinHood_Trade`'s
   `place_order` → calls `record_outcome` once the trade closes.

This is an assumption to confirm the moment the connector is authorized and
its actual tool surface is inspectable — if Robinhood's endpoint turns out
to also support a direct machine-to-machine credential grant, the simpler
standalone-daemon shape becomes viable and this split isn't necessary.

### Deployment

The decision-engine server needs to be reachable by the Claude session on
every firing, so it's served over HTTP (`src/mcp/server.ts`, Express +
`StreamableHTTPServerTransport`) with a required bearer token
(`MCP_AUTH_TOKEN`), not stdio — host it on a small always-on VM/container
with persistent disk (safety/halt state and learned weights live on disk;
a cold-starting serverless function would lose them between firings).

## Setup

```bash
cd robinhood-trading-agent
npm install
cp .env.example .env   # fill in MCP_AUTH_TOKEN at minimum (openssl rand -hex 32)
npm run mcp            # starts the decision-engine server (default MODE=dry-run)
```

Then point a persistent Claude Code Remote session at this server's URL as
an MCP connection, alongside the authorized `RobinHood_Trade` connector, and
set up the cron Routine described above.

For local testing without any of that:

```bash
npm run cli -- status         # safety/halt state + current learned weights
npm run cli -- halt "testing" # manual kill-switch
npm run cli -- resume
npm test                      # unit tests
npm run backtest              # walk-forward backtest over synthetic fixture bars
```

## Strategy defaults

5-minute bars, ≥50 bars of history per cycle. Candlestick patterns: Doji,
Hammer/Hanging-Man, Shooting-Star/Inverted-Hammer, Bullish/Bearish
Engulfing, Morning/Evening Star, Three White Soldiers/Three Black Crows
(volume-confirmed at ≥1.5× 20-bar average, else half weight). Trend: EMA(9)
vs EMA(21). Momentum: RSI(14, 70/30), MACD(12,26,9). Volatility: Bollinger
Bands(20,2σ) for signal, ATR(14) for position sizing. All combined with the
sentiment score into one weighted vote — see `src/strategy/signal.ts`.

Position sizing (`src/execution/sizing.ts`):

```
buyingPower      = cash + (marginEnabled ? maxMarginBuyingPower * MARGIN_UTILIZATION_CAP : 0)
volatilityScalar = clamp(ATR(14)_baseline / ATR(14)_current, 0.25, 1.0)
positionSize     = buyingPower * confidence * volatilityScalar
```

No hard per-trade cap, per the configuration above — but a noisy signal or
an unusually volatile symbol sizes down automatically rather than always
swinging for the full balance.

## Self-learning

After each closed trade (`record_outcome`), every signal that contributed to
that decision gets nudged: up if it agreed with a winning trade or correctly
opposed a losing one, down if it agreed with a losing trade or opposed a
winning one. Every step is bounded (`RISK_LIMITS.learning.stepSize`) and
every weight is clamped (`minWeight`/`maxWeight`) — see
`src/learning/update.ts` — so no signal can run away to dominate or vanish.
This is what keeps "fully autonomous online learning" from degenerating into
unbounded drift while still requiring no human approval to take effect.

A separate, non-authoritative `generate_reflection` tool periodically asks
an LLM to write a plain-language explanation of recent weight movements for
the audit log — it cannot itself move a weight.

## News & LLM providers

- **Finnhub** (`FINNHUB_API_KEY`) — financial/company headlines.
- **NewsAPI.org** (`NEWSAPI_KEY`) — world/political headlines. **Its free
  Developer plan disallows production/commercial use** — get a paid plan or
  swap providers (the `NewsProvider` interface is generic) before `MODE=live`.
- **LLM**: defaults to this monorepo's own `freellmapi` gateway
  (`LLM_GATEWAY_URL`, OpenAI-compatible). A failed/invalid response degrades
  to a neutral sentiment score rather than blocking the trading loop — see
  `src/sentiment/sentimentEngine.ts`.

Every LLM call in the decision path returns strict, schema-validated JSON
(never free-form prose parsed after the fact), reasons step-by-step before
its final answer (logged in full), and is explicitly told it may only
score/explain — never recommend a trade — see `src/sentiment/sentimentEngine.ts`
and `src/learning/reflection.ts` for the actual system prompts.

## Safety guardrails

- **Daily-loss kill-switch** (`src/safety/equityGuard.ts`): halts all
  trading if today's equity drop hits `DAILY_LOSS_HALT_PCT` (10% default).
  This is the one hard, load-bearing stop in an otherwise uncapped,
  self-modifying design — treat it as such, not a tuning knob.
- **Margin-call guard** (`src/safety/marginGuard.ts`): halts immediately if
  margin maintenance utilization approaches the broker's call threshold,
  independent of and faster than the daily check.
- **Pattern-day-trader guard** (`src/safety/pdt.ts`): for equities only,
  blocks a same-day round-trip once 3 day trades have occurred in the
  rolling 5-business-day window, if account equity is under $25k. Crypto is
  unaffected. The window only excludes weekends, not U.S. market holidays —
  see the docstring on `lastNBusinessDays` for why that's not guaranteed
  conservative in either direction, and don't treat it as compliance-grade
  without a real market-holiday calendar.
- Any halt (auto or manual) persists until an explicit `resume` — see
  `src/safety/killSwitch.ts`.

## Open risks

- **No per-trade position cap.** A single bad signal can commit the full
  account balance (plus margin) to one position. The daily kill-switch
  limits *daily* damage, not a single catastrophic intraday move before the
  next safety check runs.
- **Margin is enabled.** Losses can exceed deposited capital, and Robinhood
  can force-liquidate positions on a margin call without waiting for this
  agent's own safety check to run.
- **Fully autonomous online learning** means the strategy this agent trades
  with next week may differ meaningfully from the one it started with, with
  no human sign-off on that drift — only the bounded-weight clamp and the
  audit log constrain it.
- **News/politics sentiment via LLM call** adds a live external dependency
  into the decision path. A low-quality or adversarial source can skew the
  score; it's capped as one weighted vote and degrades to neutral on
  failure, but a biased-yet-live signal that happens to correlate with a
  winning trade can still get reinforced by the learning update.
- **NewsAPI.org's free tier disallows production use** — resolve before
  `MODE=live`.
- Routing sentiment through `freellmapi`'s own free-tier LLM aggregation
  adds a dependency on that gateway's uptime/quality for a real-money
  decision path — acceptable only because failures degrade to neutral.
- Robinhood's actual tool names/schemas at `agent.robinhood.com/mcp/trading`
  and its terms for automated/agentic trading are unverified until the
  connector is authorized and exercised.
- Crypto trades 24/7, equities don't — the cron Routines for each need
  separate schedules.

## Staged rollout

See `test/manual-checklist.md`. Do not skip straight to `MODE=live`.
