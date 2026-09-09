# Memo 01 — Strategy and value proposition

**Source:** [HedgeThink — How to Become a Hedge Fund Manager](https://www.hedgethink.com/how-to-become-a-hedge-fund-manager/) (sections: *Articulating a Unique Investment Strategy*, *Understanding the Core Value Proposition*, *Developing a Comprehensive Business Blueprint*).  
**Applies to:** robinhoodhood dry-run / paper prototype fund.

## Unique strategy (what we claim)

1. **Style:** Intraday-to-swing equity + crypto loop driven by a deterministic decision-engine (signals, sizing, safety), with human approval for live orders.
2. **Edge hypothesis (testable, not marketing):** Combining (a) liquid universe construction (gainers, sector proxies, IBD research memory, core seeds), (b) multi-signal technical/sentiment inputs, and (c) hard risk gates (halt, PDT awareness, dry-run paper discipline) can produce a *documented, reviewable* process — even before alpha is proven.
3. **What we will not do:** Invent BUY/SELL from headlines alone; bypass `check_safety` / human approval; trade outside the cycle universe; pretend dry-run fills are live fills.

## Value proposition (why capital would care later)

- **Process transparency:** Every cycle logs sources, decisions, and outcomes (`record_outcome`, research memory, reflections).
- **Risk-first operating system:** Kill-switch, mode checks, and readiness gates before any live unlock.
- **Research flywheel:** IBD AM/PM passes + curriculum-informed thesis quality (see `pm-operating-system.md`).

## Business blueprint (prototype-fund version)

| Blueprint block | Prototype mapping |
|-----------------|-------------------|
| Executive summary | Dry-run decision-engine + RobinHood Trade orchestrator |
| Management team | See memo 02 role map |
| Market analysis | Liquid US equities, sector ETFs, major crypto; IBD leaders as research seed |
| Investment strategy details | Decision-engine `compute_decision` + sizing; orchestrator never invents trades |
| Marketing / IR | Cycle reports + paper PnL chart + readiness report (credibility memo 04) |

## Agent checklist each major research/trading cycle

- [ ] Restate the *current* edge hypothesis in one sentence (update if invalidated).
- [ ] Name instruments and *why* they fit the universe rules.
- [ ] State risk limits and which safety tool enforced them.
- [ ] Separate **process quality** from **P&L luck** in the write-up.
