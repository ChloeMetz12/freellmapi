# Memo 03 — Compliance checklist (prototype fund)

**Source:** [HedgeThink](https://www.hedgethink.com/how-to-become-a-hedge-fund-manager/) (*Navigating the Regulatory and Compliance Landscape*).  
**Important:** This is **operational compliance for the agent stack**, not legal advice and not a substitute for SEC/FCA registration if a real fund is ever launched.

## Map: textbook compliance → robinhoodhood controls

| Textbook theme | Agent / stack control |
|----------------|----------------------|
| Authorization / permissions | Account tradability checks; options level; agentic permissions |
| Ongoing reporting | Cycle reports; research memory; paper PnL; reflections |
| Code of ethics / conflicts | No invented tickers; no bypass of human approval; no overclaiming fills |
| Risk management | `check_safety`, halt/resume, sizing, bars ≥21 (≥50 preferred) |
| AML/KYC (fund-level) | Out of scope for dry-run agent — human/broker own KYC |
| Regulatory filings (fund-level) | Out of scope until a real fund entity exists |

## Pre-cycle checklist (every firing)

1. `get_status` — note `mode` and `halted`.
2. If halted → report reason, stop trading actions for the cycle.
3. Confirm dry-run: never call `place_*` when mode is dry-run or `executeOrder` is false.
4. Universe only from tools + configured core seeds.
5. Equity vs crypto account fields never swapped (`account_number` vs `rhs_account_number`).

## Pre-order checklist (live mode only, after human unlock)

1. Fresh quote / tradability.
2. `check_safety` with current equity (and margin util if relevant).
3. `size_order` rationale presented to human.
4. Explicit human confirmation of exact symbol, side, size, order type.
5. Fresh `ref_id` UUID per logical order; no approval bypass.

## Ethics / IR honesty

- Label estimates and delayed data.
- Do not imply guaranteed returns (HedgeThink credibility theme).
- Document losses as carefully as wins (track-record memo).
