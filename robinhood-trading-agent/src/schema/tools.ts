import { z } from "zod";
import { SIGNAL_KEYS } from "../strategy/types.js";
import { assetClassSchema, marketTrendSchema, ohlcvBarSchema } from "./marketdata.js";

export const getSentimentInputSchema = z.object({
  marketTrend: marketTrendSchema,
});

export const computeDecisionInputSchema = z.object({
  symbol: z.string().min(1),
  bars: z.array(ohlcvBarSchema).min(1, "at least one OHLCV bar is required; most indicators need 50+ for a meaningful read"),
});

export const checkSafetyInputSchema = z.object({
  currentEquity: z.number().positive(),
  /** 0-1, broker's margin maintenance utilization; omit/null if margin isn't in use on this account. */
  marginMaintenanceUtilization: z.number().min(0).max(1).nullable().default(null),
});

export const sizeOrderInputSchema = z.object({
  symbol: z.string().min(1),
  currentPrice: z.number().positive(),
  action: z.enum(["BUY", "SELL", "HOLD"]),
  confidence: z.number().min(0).max(1),
  score: z.number().min(-1).max(1),
  contributingSignals: z.array(z.object({ key: z.enum(SIGNAL_KEYS), vote: z.number(), weight: z.number(), detail: z.string() })),
  cash: z.number().min(0),
  maxMarginBuyingPower: z.number().min(0).default(0),
  bars: z.array(ohlcvBarSchema).min(1),
});

export const recordOutcomeInputSchema = z.object({
  symbol: z.string().min(1),
  assetClass: assetClassSchema,
  action: z.enum(["BUY", "SELL"]),
  decisionScore: z.number().min(-1).max(1),
  contributingSignals: z.array(z.object({ key: z.enum(SIGNAL_KEYS), vote: z.number() })),
  realizedReturnPct: z.number(),
  isDayTrade: z.boolean(),
  currentEquity: z.number().positive(),
  closedAt: z.string().optional(),
});

export const haltInputSchema = z.object({
  reason: z.string().min(1),
});

export const resumeInputSchema = z.object({});
export const getStatusInputSchema = z.object({});
export const generateReflectionInputSchema = z.object({});
