import type { Action, SignalKey } from "../strategy/types.js";
import type { SizingResult } from "./sizing.js";

export interface OrderPlan {
  symbol: string;
  side: "BUY" | "SELL";
  notionalUsd: number;
  estimatedShares: number;
  rationale: string;
}

/**
 * Only the fields orderPlan actually needs from a decision — deliberately
 * not the full `strategy/types.Decision` (whose contributingSignals also
 * carry a `contribution` field that's irrelevant here and awkward to
 * thread back through the MCP tool boundary as a required field).
 */
export interface OrderPlanDecisionInput {
  action: Action;
  confidence: number;
  score: number;
  contributingSignals: Array<{ key: SignalKey; vote: number; weight: number }>;
}

/**
 * This package never calls `place_order` itself (see README — that tool
 * belongs to the calling Claude session's `RobinHood_Trade` connector).
 * This just packages the decision + sizing into the plan that session
 * should execute, plus the rationale for the audit log.
 */
export function buildOrderPlan(symbol: string, currentPrice: number, decision: OrderPlanDecisionInput, sizing: SizingResult): OrderPlan | null {
  if (decision.action === "HOLD") return null;
  if (currentPrice <= 0 || sizing.positionSizeUsd <= 0) return null;

  const contributingSummary = decision.contributingSignals.map((s) => `${s.key}=${s.vote.toFixed(2)}(w${s.weight.toFixed(2)})`).join(", ");

  return {
    symbol,
    side: decision.action,
    notionalUsd: sizing.positionSizeUsd,
    estimatedShares: sizing.positionSizeUsd / currentPrice,
    rationale: `score=${decision.score.toFixed(2)} confidence=${decision.confidence.toFixed(2)} volatilityScalar=${sizing.volatilityScalar.toFixed(2)} signals: ${contributingSummary}`,
  };
}
