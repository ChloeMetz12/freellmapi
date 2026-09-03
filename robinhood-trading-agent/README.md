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
| Execution | **Decided: approve-per-trade ceiling.** Originally specified as fully autonomous with no per-trade human approval; confirmed by a live test that Robinhood's connector requires a human approval click on every order with no bypass (see "The real `RobinHood_Trade` tool surface" below). The user's explicit decision is to accept that click as the ceiling of "autonomous" here: everything upstream of it — market analysis, candlestick/indicator signals, sentiment/chatter, position sizing, online learning — runs continuously with zero human input, and a human's only action is tapping approve/reject on the order the persistent session presents. Day trading, intraday. |
| Learning | Fully autonomous online learning — signal weights adapt in production, no human gate before a change takes effect |
| Position sizing | No hard per-trade cap — confidence- and volatility-scaled, can use full available buying power |
| Daily loss kill-switch | Hard halt at **10% of account equity lost in a day** (`DAILY_LOSS_HALT_PCT`) |
| Asset universe | Equities + crypto + **margin/leverage**, **unrestricted symbol universe** — no watchlist/allowlist anywhere in this package (see "Unrestricted symbol universe" below) |
| Decision inputs | Candlestick patterns + technical indicators + market-trend/world-news sentiment + **per-symbol StockTwits/X social chatter** (see "Social chatter" below — the noisiest, most manipulable input in the strategy) |

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
   quotes/history/account state → calls this server's `compute_decision` →
   calls `check_safety` → if clear, calls `size_order` then presents the
   proposed order to the user for the human approval tap Robinhood's
   connector requires (see "The real `RobinHood_Trade` tool surface" below —
   this step cannot be skipped or automated) → on approval, calls
   `RobinHood_Trade`'s order-placement tools → calls `record_outcome` once
   the trade closes.

### The real `RobinHood_Trade` tool surface (confirmed, 67 tools)

The names above (`get_quote`, `place_order`, etc.) were placeholders written
before the connector was authorized. The actual surface, once inspected, is
organized per asset class rather than as one generic set — this package's
`mcp/server.ts` tool descriptions and any orchestrating prompt need to name
the real tools:

- **Accounts**: `get_accounts` (lists accounts — call this first),
  `get_portfolio(account_number)` for buying power/equity breakdown. Equity
  and option calls use `account_number`; **crypto calls use a different
  field, `rhs_account_number`**, from the same or a separate account listing
  — don't assume they're interchangeable.
- **Equities**: `get_equity_quotes`, `get_equity_historicals` (OHLCV),
  `get_equity_positions`, `get_equity_orders`, `get_equity_tradability`,
  `get_equity_tax_lots`. Order flow is
  `review_equity_order(...)` → `place_equity_order(...)` →
  `cancel_equity_order(account_number, order_id)`.
- **Crypto**: mirrors equities under its own names —
  `get_crypto_quotes`, `get_crypto_positions`, `get_crypto_orders`, and
  `preview_crypto_order(...)` → `place_crypto_order(...)` →
  `cancel_crypto_order(rhs_account_number, order_id)`.
- **Options**: also present (`get_option_chains`, `place_option_order`,
  `exercise_option`, etc.) but out of scope — this package's strategy/sizing
  was built for equities+crypto only (see Open risks).
- **Also available, not yet wired into this package but worth knowing
  about**: `get_equity_technical_indicators` (RSI/MACD/BB/EMA/SMA/ATR/VWAP
  computed by Robinhood itself — this package currently computes its own in
  `src/strategy/indicators/` instead, deliberately, to keep the risk-critical
  path testable/auditable independent of an external implementation, but
  it's an option to cross-check against), `get_equity_news`,
  `get_earnings_calendar`/`get_earnings_results`, `get_financials`,
  `get_sec_filing*` — these could supplement or partly replace the Finnhub
  provider in `src/sentiment/` for the financial-news half of sentiment
  (NewsAPI would still be needed for the world/politics half).

**Confirmed — autonomy is capped by this connector, empirically, not just
inferred.** Every order-placing tool (`place_equity_order`,
`place_option_order`, `place_crypto_order`) is paired with a
`review_*`/`preview_*` tool meant to be called first. `place_equity_order`'s
input schema (`account_number`, `symbol`, `side`, `type`,
`quantity`/`dollar_amount`, `limit_price`, `stop_price`, `market_hours`,
`time_in_force`, `tax_lots`) has **nothing resembling a `confirm`,
`dry_run`, or `preview_id` field** — no parameter exists through which a
calling agent could supply "yes, actually place this" itself.

That inference was then directly confirmed by a live test: a session with
this connector attached was explicitly told to place five real 1-share
market buy orders (on IBIT/FBTC/BITB/ETHA/FETH). **Each `place_equity_order`
call required an explicit human approval click before it was submitted** —
they all ultimately failed at Robinhood's own buying-power check, but only
*after* being approved and sent. So the gate is real, it's a human-facing
approval step outside the tool call (not a `salesforce-gantt-agent`-style
`confirm_dispatch` an autonomous loop could call on its own), and it cannot
be bypassed by anything this package computes.

**This means the "fully autonomous, no per-trade human approval"
configuration this package was originally built for (see the table at the
top of this README) is not achievable through this connector as it
currently exists.** Every real order this agent ever wants to place will
need a human to approve it individually, regardless of what `size_order`
computes or how confident the strategy is.

**Decision (resolved):** accept human-in-the-loop approval as the real
shape of "autonomous" for this project. This agent proposes, sizes, and
learns continuously and fully autonomously; a human taps approve/reject per
trade instead of the agent firing it directly. The alternative — dropping
this connector for a broker with true zero-touch order placement via
API keys (e.g. Alpaca, Interactive Brokers) — was considered and explicitly
declined for now; it would mean rewriting `execution/` and `mcp/` against a
new broker's API and is treated as a separate, later effort if the
approval step ever proves too limiting in practice. Every design and
orchestration decision downstream of this point (the persistent session's
per-cycle flow, the audit log, the manual checklist) assumes a human is
present to approve or reject each order the agent proposes.

### Deployment

The decision-engine server needs to be reachable by the Claude session on
every firing, so it's served over HTTP (`src/mcp/server.ts`, Express +
`StreamableHTTPServerTransport`) with a required bearer token
(`MCP_AUTH_TOKEN`), not stdio — host it on a small always-on VM/container
with persistent disk (safety/halt state and learned weights live on disk;
a cold-starting serverless function would lose them between firings).

The `Dockerfile`/`docker-compose.yml` in this package are one way to do
that — see "Docker" under Setup below. Whatever the container's host is,
it needs a **stable, internet-reachable URL** for the persistent Claude
session to call — a host with its own public IP/hostname can work
directly (the compose file's port publishing defaults to localhost-only;
see "Docker" below for the one setting that opts it into being reachable);
a machine behind NAT/a home network needs something in front of it (a
Cloudflare Tunnel, Tailscale Funnel, etc.) rather than port-forwarding.

## Setup

```bash
cd robinhood-trading-agent
npm install
cp .env.example .env   # fill in MCP_AUTH_TOKEN at minimum (openssl rand -hex 32)
npm run mcp            # starts the decision-engine server (default MODE=dry-run)
```

### Docker

```bash
cd robinhood-trading-agent
cp .env.example .env   # fill in MCP_AUTH_TOKEN at minimum
docker compose up -d --build
curl -i http://localhost:8787/mcp   # expect 401 with no Authorization header
```

`docker-compose.yml` mounts named volumes at `/app/state` and `/app/runs`
so safety/halt state, the PDT trade log, and learned weights survive a
container restart or rebuild — **never** run the image without these
mounted (or an equivalent bind mount). `SafetyStateStore` only fails
closed (halts, requires a manual resume) on corrupt/unreadable state; a
genuinely *missing* state file is treated like a fresh install and falls
back to defaults, not a halt — so a *lost* volume is a silent reset of the
kill-switch and PDT history, which is worse than a loud failure.

By default the compose file publishes port 8787 bound to `127.0.0.1` only
— reachable from this machine for the `curl` check above, but not the LAN
or internet. If this host already has its own public IP/hostname and you
want to skip the tunnel below, set `MCP_PUBLISH_BIND=0.0.0.0` (or a
specific interface IP) in `.env` and re-run `docker compose up -d --build`
— still gated by `MCP_AUTH_TOKEN` either way. A host behind NAT should
leave this alone and use the tunnel instead (below), which reaches the
`mcp` service over the internal compose network, not this published port.

If `LLM_GATEWAY_URL` in `.env` points at `localhost` (the default, for
this monorepo's own gateway), that won't resolve to the host machine from
inside the container — point it at `host.docker.internal` (Docker
Desktop) or the gateway's real reachable address instead.

#### Exposing it if this host is behind NAT (home/office network)

The persistent Claude session calling this server runs outside your
network, so if this machine doesn't have its own public IP/hostname, don't
port-forward — use a **Cloudflare Tunnel** instead (no inbound port
opened on your router at all):

1. In the [Cloudflare dashboard](https://dash.cloudflare.com/) →
   **Networking → Tunnels → Create a tunnel**. Choose **Cloudflared**,
   give it a name (e.g. `robinhood-trading-agent`), and on the connector
   install step pick **Docker** — copy just the token value
   (`eyJhIjoi...`), not the whole install command.
2. Put that token in `.env` as `CLOUDFLARE_TUNNEL_TOKEN`.
3. Still on the tunnel's setup page, add a **Public Hostname**: pick a
   subdomain of a zone already on your Cloudflare account (e.g.
   `rht-mcp.yourdomain.com`), service type **HTTP**, URL `mcp:8787` (or
   `mcp:<your MCP_HTTP_PORT>` if you changed it from the default in
   `.env`) — that hostname, not `localhost`, since `cloudflared` reaches
   the `mcp` service over the compose network by its service name.
4. Start both services with the tunnel enabled:
   `docker compose --profile tunnel up -d --build` (plain `docker compose
   up` never starts `cloudflared` and never requires
   `CLOUDFLARE_TUNNEL_TOKEN`, for a host that already has its own
   reachable address).
5. Confirm from any machine: `curl -i https://rht-mcp.yourdomain.com/mcp`
   should return 401 with no `Authorization` header, the same as the local
   check above — that's the URL the persistent Claude Code Remote session
   should be pointed at.

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

## Unrestricted symbol universe

Per the user's explicit choice, there is no watchlist or allowlist anywhere
in this package — `compute_decision`, `size_order`, and `record_outcome` all
accept any symbol the calling session passes them. `src/config/watchlist.ts`
intentionally exports nothing but the `AssetClass` type and the index/ETF
proxy symbols used for the market-trend snapshot; there used to be a
`DEFAULT_WATCHLIST` placeholder there, but it was never actually enforced
anywhere in the code, so it was removed rather than left as a misleading
suggestion of a restriction that didn't exist.

What this means in practice: the strategy will evaluate literally any
symbol the orchestrating session feeds it OHLCV bars for, and if the
combined signal crosses the decision threshold, will size and (once wired
to a live order call) attempt to trade it — including a symbol nobody
specifically chose to watch, a thinly-traded small-cap, or a low-float
crypto token. The only backstops are the symbol-agnostic ones in
`safety/` (daily-loss kill-switch, margin-call guard, PDT counting) — none
of them limit *which* symbols can be traded, only how much damage a bad
call can do before the kill-switch trips. See "Social chatter" below and
"Open risks" for why this combination needs to be understood, not just
enabled.

## Social chatter (StockTwits/X)

A `social_chatter` signal (`get_symbol_chatter` tool,
`src/social/chatterEngine.ts`) reads recent StockTwits messages and X posts
mentioning a specific ticker and reasons over them into a bounded score —
the same structured-output/scratchpad/degrade-to-neutral pattern as the
macro `sentiment` signal (see `src/sentiment/sentimentEngine.ts`), including
its own system prompt that explicitly names pump-and-dump/bot-repetition
patterns to watch for before trusting one-sided chatter.

- **StockTwits**: no API key needed for its public per-symbol stream;
  messages sometimes carry the author's own bullish/bearish tag, which the
  LLM is told to weigh against the free-text tone (agreement vs. divergence
  is itself a signal).
- **X ticker search** (`X_BEARER_TOKEN`): cashtag search (`$SYMBOL`) for the
  given ticker. Requires the paid Basic API tier or above.
- **Result is cached per-symbol** (`src/social/chatterCache.ts`, 5-minute
  TTL by default) so calling `get_symbol_chatter` every `compute_decision`
  cycle for the same symbol doesn't re-fetch or re-call the LLM every time —
  important for staying within the paid X tier's rate limits.
- **Starts at a lower default weight (0.5)** than every other signal in
  `DEFAULT_SIGNAL_WEIGHTS` — it only gains more influence over time if
  `learning/`'s bounded update rule finds it's actually been right, the same
  mechanism every other signal is subject to. It is not trusted more than
  that just because it exists.

This is, bluntly, the single most manipulable input in the whole strategy —
see "Open risks" for why, especially combined with the unrestricted symbol
universe above.

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

Macro/market-wide sentiment (`get_sentiment`, `src/sentiment/`):

- **Finnhub** (`FINNHUB_API_KEY`) — financial/company headlines.
- **NewsAPI.org** (`NEWSAPI_KEY`) — world/political headlines. **Its free
  Developer plan disallows production/commercial use** — get a paid plan or
  swap providers (the `NewsProvider` interface is generic) before `MODE=live`.
- **Benzinga** (`BENZINGA_API_KEY`, paid) — real-time stock news, popular
  among algorithmic trading tools for speed.
- **CoinGecko** (`COINGECKO_API_KEY`, optional) — crypto market data (BTC
  dominance, trending coins); no key required for the free-tier endpoints
  used here, synthesized into one summary "headline" per cycle.
- **X macro news** (`X_BEARER_TOKEN`, paid) — headlines from a curated set
  of wire-service/official accounts (`src/sentiment/providers/xMacroNews.ts`),
  not an open keyword search, specifically to avoid pulling in the kind of
  unverified chatter the sentiment prompt is told to discount.

Per-symbol chatter (`get_symbol_chatter`, `src/social/`) — see "Social
chatter" above: **StockTwits** (no key) and **X ticker search**
(`X_BEARER_TOKEN`, same token as macro news, paid tier).

- **LLM**: defaults to this monorepo's own `freellmapi` gateway
  (`LLM_GATEWAY_URL`, OpenAI-compatible), used for both `get_sentiment` and
  `get_symbol_chatter`. A failed/invalid response degrades to a neutral
  score rather than blocking the trading loop — see
  `src/sentiment/sentimentEngine.ts` and `src/social/chatterEngine.ts`.

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

- **Unrestricted symbol universe + social chatter + margin + no position
  cap is a compounding combination, not four independent risks.** An
  autonomous strategy that can act on *any* symbol, partly driven by
  StockTwits/X chatter (exactly the channel coordinated pump-and-dump
  schemes and bot networks concentrate in), with margin available and no
  cap on position size, is a well-known pattern for accounts to lose money
  fast on a manipulated low-float or meme-adjacent ticker. The
  `social_chatter` signal's lower default weight, the LLM prompt's explicit
  instruction to discount repetitive/unsubstantiated chatter, and the daily
  kill-switch all reduce this risk — none of them eliminate it. This was
  explicitly chosen after the tradeoff was raised with the user.
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
- **Order placement requires human confirmation Robinhood itself
  enforces**, confirmed by a live test (see "The real `RobinHood_Trade`
  tool surface" above) — not something this package (or any calling agent)
  can supply itself. No code in this package can make execution fully
  autonomous. **Resolved**: the project accepts continuous autonomous
  proposal/sizing/learning with a human tap-to-approve step per trade as
  the real shape of "autonomous" here (see "Architecture" above); a broker
  switch for true zero-touch execution was considered and declined for now.
- Robinhood's terms of service for automated/agentic trading via this
  connector are still unverified even though its tool surface now is.
- Crypto trades 24/7, equities don't — the cron Routines for each need
  separate schedules.

## Staged rollout

See `test/manual-checklist.md`. Do not skip straight to `MODE=live`.
