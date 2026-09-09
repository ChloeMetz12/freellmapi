# PM operating system — robinhoodhood

Distilled portfolio-manager operating principles for this stack.  
**Primary narrative source:** [HedgeThink — How to Become a Hedge Fund Manager](https://www.hedgethink.com/how-to-become-a-hedge-fund-manager/)  
**Curriculum base:** FT Global MBA 2025 Top 50 public investment / AM / HF electives — see [ft-mba-top50-inventory.md](ft-mba-top50-inventory.md) and [digests/](digests/).  
**Local memos:** [memos/01-strategy-and-value-prop.md](memos/01-strategy-and-value-prop.md) · [02-role-map.md](memos/02-role-map.md) · [03-compliance-checklist.md](memos/03-compliance-checklist.md) · [04-track-record-credibility.md](memos/04-track-record-credibility.md)

This document shapes **research quality, risk framing, and reporting**. It does **not** replace decision-engine `compute_decision` / `size_order` / `check_safety`.

---

## 1. Strategy clarity (HedgeThink + Wharton / Booth / LBS pattern)

Before treating a symbol as “actionable research,” state:

1. **Hypothesis** — what must be true for the idea to work.
2. **Edge type** — momentum, mean-reversion, catalyst, relative value, factor, etc. (Wharton Investment Management / Hedge Funds taxonomy).
3. **Invalidation** — what price action, data miss, or risk event kills the idea.
4. **Horizon** — intraday cycle vs multi-day hold (match the loop you are in).

If you cannot fill those four lines, record a weak `thesis` or skip — do not invent conviction.

## 2. Portfolio construction over stock stories (cross-school consensus)

Top programs repeatedly teach **portfolio math** ahead of narrative stock-picking (Wharton FNCE 7050, UCLA 232A, NUS BMA5302, HKUST Investment Analysis, Ross Applied Portfolio Management):

- Size from risk and correlation context, not story heat.
- Prefer breadth with a hard universe cap (this stack: 20) over concentration in one theme.
- Measure process: did the model and safety gates fire correctly? Separate that from P&L luck.
- Active vs passive awareness: if you cannot articulate expected alpha *source*, size smaller or stay flat.

## 3. Alternatives / hedge-fund risk objects

From Wharton Hedge Funds, Stern HF strategies, Anderson/Kayne, IIMA alts titles, Imperial AM & Alts:

- Treat **liquidity, leverage, short exposure, funding, and crowding** as first-class risks.
- Never imply uncovered shorts or leverage the broker did not approve.
- Backtest humility: past bars in `compute_decision` are not a guarantee — note regime risk in the report.

## 4. Security analysis & IBD research quality (Darden / NUS / Goizueta / IBD pass)

When skimming Investors.com or writing `record_research_event`:

- Name the **catalyst** and **timeframe**.
- Separate fact (reported event) from inference.
- Flag behavioral traps (FOMO leaders, narrative chase) — Darden Applied Security Analysis theme.
- Evening pass: score morning theses vs close; write `lesson` events (process-only).

## 5. Student-fund / prototype-fund discipline

Darden Capital Management, Anderson ASAM, Kellogg Asset Management Practicum, and HedgeThink’s “prototype fund” advice converge:

| Practice | Stack tool |
|----------|------------|
| Log every material decision | `record_research_event`, cycle report |
| Mark paper vs real capital | `get_status.mode`, never blur dry-run/live |
| Periodic review | `generate_reflection`, evening IBD |
| Readiness before scaling | `check_live_readiness` + human MODE=live |
| Transparent reporting | paper PnL chart + risk gates in write-up |

## 6. Risk & compliance operating rhythm

HedgeThink compliance chapter → memo 03. Non-negotiables each cycle:

1. `get_status` → honor `halted` and `mode`.
2. `check_safety` before any order path.
3. Dry-run ⇒ no `place_*`.
4. Live ⇒ human confirms exact order after review.
5. Honest IR language — no promised returns (HedgeThink credibility).

## 7. Communication standard (IR-lite)

Every cycle report should be readable by a skeptical outsider (Yale SOM / HBS case-style clarity, without case copyright):

```
Universe sources: …
Thesis highlights (≤5): symbol — hypothesis — invalidation
Model actions: compute_decision / size_order summary (no invented trades)
Risk: halt? mode? alerts?
Paper book: open positions + PnL context
Lessons / next watchlist:
Curriculum note (optional): which principle above drove a judgment call
```

## 8. How to use the Top 50 digests during a cycle

- Do **not** re-fetch all 50 schools each hour.
- When stuck on *how to frame* a research or risk question, open the relevant digest (e.g. `digests/wharton.md` for HF taxonomy, `digests/darden.md` for security-analysis process, `digests/nus.md` for fund-management checklist).
- Cite `pm-operating-system.md` + HedgeThink URL in durable lessons when a process change is learned.

## 9. Explicit non-goals

- This pack is not SEC/FCA registration guidance.
- Digests summarize **public** catalogs; they are not full course packs.
- Curriculum never overrides hard safety rules or decision-engine outputs.
