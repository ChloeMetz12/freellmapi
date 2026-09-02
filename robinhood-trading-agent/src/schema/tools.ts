import { z } from "zod";
import { SIGNAL_KEYS } from "../strategy/types.js";
import { assetClassSchema, marketTrendSchema, ohlcvBarSchema } from "./marketdata.js";

export const getSentimentInputSchema = z.object({
  marketTrend: marketTrendSchema,
});

export const computeDecisionInputSchema = z.object({
  symbol: z.string().min(1),
  // 21 bars is the real floor for EMA(21)/RSI(14)/ATR(14)/Bollinger(20) to
  // all be active (see strategy/signal.ts); MACD(12,26,9)'s histogram
  // additionally needs ~35 bars and simply contributes no vote below that
  // (computeSignal degrades gracefully, it doesn't error) — this schema
  // enforces the floor below which *most* signals would be silently
  // absent, not the point at which every signal is guaranteed present.
  bars: z.array(ohlcvBarSchema).min(21, "at least 21 OHLCV bars are required for the EMA/RSI/ATR/Bollinger signals to be active; MACD needs ~35 bars before it contributes"),
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
  // Validated as an actual ISO datetime, not just any string — toolHandlers
  // passes this straight into `new Date(closedAt)` and then into the PDT
  // window helper's own .toISOString() calls, which throw on an invalid
  // timestamp. Rejecting a malformed value here, at the tool boundary,
  // means a bad caller payload gets a clear schema-validation error
  // instead of crashing deep inside record_outcome.
  closedAt: z.string().datetime({ offset: true }).optional(),
});

export const haltInputSchema = z.object({
  reason: z.string().min(1),
});

export const resumeInputSchema = z.object({});
export const getStatusInputSchema = z.object({});
export const generateReflectionInputSchema = z.object({});
