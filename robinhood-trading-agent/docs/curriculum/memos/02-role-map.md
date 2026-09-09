# Memo 02 — Role map (prototype fund team)

**Source:** [HedgeThink](https://www.hedgethink.com/how-to-become-a-hedge-fund-manager/) (*Assembling Your Expert Hedge Fund Team*).  
**Applies to:** robinhoodhood stack roles — not hiring advice.

## RACI for the dry-run system

| Classic HF role | Who / what | Responsible for | Must not do |
|-----------------|------------|-----------------|-------------|
| Portfolio manager | Human (Andrew) + live approval path | Final risk appetite, live unlock, approve/reject orders | Blind auto-confirm |
| Analyst | Claude orchestrator session | Universe build, data fetch, IBD research, thesis write-ups, report quality | Invent trade decisions or place live orders in dry-run |
| Quant / PM model | decision-engine MCP | `compute_decision`, `size_order`, learning weights, paper positions | Touch Robinhood directly |
| Risk manager | decision-engine `check_safety` + orchestrator gates | Halt, mode, sizing caps, PDT awareness | Soft-pedal halt flags |
| Compliance officer | Orchestration hard rules + human | Confirmation discipline, no ToS bypass, private data hygiene | Bypass broker alerts |
| Operations | Fly deploy, MCP auth, Routines cron | Uptime, connectors, schedule AM/PM/hourly | Change MODE without human |
| Investor relations | Orchestrator cycle reports | Clear performance vs process narrative | Overclaim fills or returns |

## Collaboration norm (from HedgeThink, adapted)

High-pressure loops need **open handoffs**: research memory → hourly cycle → reflection. Analyst (orchestrator) surfaces dissent (weak thesis, thin bars, conflicting IBD vs price) instead of forcing a trade narrative.

## Agent behavior

- Announce which role you are acting in when writing (usually Analyst + Risk relay).
- Defer *trade recommendation math* to decision-engine tools.
- Escalate to Human-PM voice when MODE, halt, or live readiness is involved.
