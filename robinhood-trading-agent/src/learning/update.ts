import { RISK_LIMITS } from "../config/riskLimits.js";
import type { SignalKey, SignalWeights } from "../strategy/types.js";

/** A realized return of this magnitude (2%) maps to a full-size learning step; larger moves don't step further, they just clamp. */
const REFERENCE_RETURN = 0.02;

export interface WeightAdjustment {
  key: SignalKey;
  before: number;
  after: number;
  delta: number;
}

export interface ClosedTradeAttribution {
  key: SignalKey;
  vote: number;
}

function sign(x: number): number {
  if (x > 0) return 1;
  if (x < 0) return -1;
  return 0;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Bounded online weight update: a signal that agreed with a decision that
 * turned out to win gets nudged up; one that agreed with a losing decision
 * gets nudged down; a signal that *disagreed* with the decision taken is
 * nudged the opposite way (it was right to object, or wrong to object),
 * mirroring a simple credit-assignment bandit. Every step is clamped to
 * `RISK_LIMITS.learning.stepSize` and every resulting weight is clamped to
 * [minWeight, maxWeight] — this is what keeps "self-learning" bounded
 * instead of letting one signal runaway to dominate or vanish (see plan's
 * Open Risks).
 */
export function applyLearningUpdate(currentWeights: SignalWeights, contributingSignals: ClosedTradeAttribution[], decisionScoreSign: number, realizedReturnPct: number): { weights: SignalWeights; adjustments: WeightAdjustment[] } {
  const { stepSize, minWeight, maxWeight } = RISK_LIMITS.learning;
  const normalizedReward = clamp(realizedReturnPct / REFERENCE_RETURN, -1, 1);

  const weights: SignalWeights = { ...currentWeights };
  const adjustments: WeightAdjustment[] = [];

  for (const { key, vote } of contributingSignals) {
    const alignment = sign(vote) * sign(decisionScoreSign);
    if (alignment === 0) continue;

    const before = weights[key];
    const delta = stepSize * alignment * normalizedReward;
    const after = clamp(before + delta, minWeight, maxWeight);
    weights[key] = after;
    adjustments.push({ key, before, after, delta: after - before });
  }

  return { weights, adjustments };
}
