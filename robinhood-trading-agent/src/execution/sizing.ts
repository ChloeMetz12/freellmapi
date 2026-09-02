import { RISK_LIMITS } from "../config/riskLimits.js";
import { baselineAtr, atr } from "../strategy/indicators/atr.js";
import type { OhlcvBar } from "../marketdata/types.js";

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export interface SizingInput {
  cash: number;
  maxMarginBuyingPower: number;
  marginEnabled: boolean;
  confidence: number;
  bars: OhlcvBar[];
}

export interface SizingResult {
  buyingPowerUsd: number;
  marginHeadroomUsd: number;
  volatilityScalar: number;
  positionSizeUsd: number;
}

/**
 * Implements the plan's sizing formula exactly:
 *
 *   buyingPower      = cash + (marginEnabled ? marginHeadroom : 0)
 *   marginHeadroom    = maxMarginBuyingPower * MARGIN_UTILIZATION_CAP
 *   volatilityScalar  = clamp(ATR(14)_baseline / ATR(14)_current, 0.25, 1.0)
 *   positionSize      = buyingPower * confidence * volatilityScalar
 *
 * There is deliberately no hard per-trade cap (per the user's explicit
 * choice — see plan Context) but a maximum-confidence, average-or-calmer-
 * than-usual-volatility signal is the only way to size up to the full
 * available buying power; a noisy signal or an unusually volatile symbol
 * sizes down automatically.
 */
export function computePositionSize(input: SizingInput): SizingResult {
  const marginHeadroomUsd = input.marginEnabled ? input.maxMarginBuyingPower * RISK_LIMITS.marginUtilizationCap : 0;
  const buyingPowerUsd = input.cash + marginHeadroomUsd;

  const atrSeries = atr(input.bars, 14);
  const currentAtr = atrSeries[atrSeries.length - 1];
  const baseline = baselineAtr(atrSeries);

  const volatilityScalar = currentAtr !== null && baseline !== null && currentAtr > 0 ? clamp(baseline / currentAtr, RISK_LIMITS.volatilityScalarMin, RISK_LIMITS.volatilityScalarMax) : RISK_LIMITS.volatilityScalarMin; // insufficient history to judge volatility -> size down conservatively, don't assume calm conditions

  const positionSizeUsd = buyingPowerUsd * clamp(input.confidence, 0, 1) * volatilityScalar;

  return { buyingPowerUsd, marginHeadroomUsd, volatilityScalar, positionSizeUsd };
}
