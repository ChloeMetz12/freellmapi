# Manual staged rollout checklist

Follow this in order. Do not skip ahead to `MODE=live` because the unit
tests and backtest pass — those only validate the deterministic math, not
the live wiring or your actual risk tolerance for this specific account.

## 1. Local validation (no external services needed)

- [ ] `npm test` passes.
- [ ] `npm run backtest` runs and produces a report (win rate / cumulative
      return / max drawdown) over the synthetic fixture bars. This is a
      sanity check on the strategy's shape, not a promise of live edge —
      regenerate `backtest/fixtures/sample-ohlcv.json` with
      `npx tsx backtest/fixtures/generate.ts`, or better, swap in real
      historical bars once the `RobinHood_Trade` connector is authorized.
- [ ] `npm run mcp` starts cleanly and rejects unauthenticated requests
      (verify with `curl` and no `Authorization` header → expect 401).
- [ ] `npm run cli -- status` / `halt` / `resume` work against a fresh
      `state/` directory.

## 2. Connector authorization

- [x] Authorize the `RobinHood_Trade` MCP connector in an interactive
      Claude session (`claude mcp` / `/mcp`, or claude.ai connector
      settings). **Done** — real tool list confirmed (67 tools); see
      README.md's "The real `RobinHood_Trade` tool surface" section for the
      actual names (`get_accounts`, `get_equity_quotes`/`historicals`,
      `place_equity_order`/`place_crypto_order`, etc. — quite different
      from this package's original placeholder assumptions).
- [ ] **Resolve the order-confirmation question before going further.**
      Every `place_*_order` tool is paired with a `review_*`/`preview_*`
      call and "requires explicit user confirmation before firing" per the
      connector session that inspected it. Determine whether that's a
      human-facing UI prompt (which caps how autonomous execution can
      actually be) or a parameter the calling agent supplies itself. This
      may mean the "fully autonomous, no per-trade approval" goal isn't
      achievable as originally specified through this connector — surface
      that to the user rather than assuming either way.
- [ ] Confirm `account_number` (equities/options) vs `rhs_account_number`
      (crypto) are correctly threaded through wherever this package's
      tools are called with account context.

## 3. Dry-run against real market data

- [ ] Set up the persistent Claude Code Remote session + cron Routine
      described in `README.md`, with `MODE=dry-run` (the default).
- [ ] Confirm `compute_decision` / `get_sentiment` run against real bars
      and real news without errors for at least a few full trading days.
- [ ] Confirm `check_safety` correctly rebaselines `dayStartEquity` at the
      start of each new trading day.
- [ ] Review the audit log (`runs/<date>.jsonl`) — every decision, even
      HOLDs, should be present and legible.

## 4. Prove the kill-switch actually trips

- [ ] With a disposable/test value, call `check_safety` with a
      `currentEquity` manufactured to be ≥10% below the recorded
      `dayStartEquity` and confirm it reports `halted: true` with a clear
      reason.
- [ ] Confirm a subsequent `check_safety` call stays halted without
      re-triggering, and that `compute_decision`/`size_order` calls are
      still safe to call (they don't themselves check the halt flag — the
      orchestrating Claude session must check `check_safety` before every
      order, every cycle).
- [ ] Call `resume` and confirm the halt clears.
- [ ] Repeat for a manufactured `marginMaintenanceUtilization` ≥ 0.9.

## 5. Resolve the licensing/config open items

- [ ] NewsAPI.org: confirm you're on a plan that permits production use, or
      swap `sentiment/providers/newsApiWorldNews.ts` for an alternative.
- [ ] Confirm `LLM_GATEWAY_URL` points at a `freellmapi` deployment (or
      direct provider) reliable enough for a live-money decision path.
- [ ] Decide the real watchlist (`src/config/watchlist.ts` is a
      placeholder) and confirm each symbol's asset class is correct.

## 6. First live run

- [ ] Flip `MODE=live` only once steps 1-5 are all checked.
- [ ] Start with the smallest realistic amount of capital actually present
      in the account — do not fund it fully before this step.
- [ ] Watch the audit log closely for the first several live sessions,
      specifically: every `order` entry's sizing math, every
      `learning_update`'s weight deltas, and immediately investigate any
      `halt` entry before resuming.
