import { z } from "zod";
import type { Env } from "../config/env.js";
import { callGatewayJson } from "../sentiment/llmClient.js";
import type { WeightAdjustment } from "./update.js";

const REFLECTION_SYSTEM_PROMPT = `You review a trading agent's recent closed trades and how its per-signal
weights were adjusted afterward. Write a short, human-readable explanation
of *why* certain signals over- or under-performed recently, grounded only
in the data given — do not speculate beyond it.

Your output is for a human audit log only. It has no effect on the live
strategy: the numeric weight changes already happened via a separate
bounded, deterministic rule before you were called. Do not suggest
different weight values or trading actions.

Respond with ONLY a JSON object (no markdown fences):
{ "rationale": "<2-4 sentences, concrete, citing specific signals/trades>" }`;

const reflectionSchema = z.object({ rationale: z.string() });

export interface ClosedTradeSummary {
  symbol: string;
  action: "BUY" | "SELL";
  realizedReturnPct: number;
  closedAt: string;
  /** Account equity as of this trade's close — feeds liveReadiness's drawdown check. Not used by the reflection prompt itself. */
  currentEquity: number;
}

/**
 * Best-effort, non-authoritative: on any failure this returns null and the
 * caller just skips logging a reflection for this batch. The bounded
 * numeric weight updates in `learning/update.ts` already happened
 * regardless — this only adds a human-readable rationale alongside them.
 */
export async function generateReflection(env: Pick<Env, "LLM_GATEWAY_URL" | "LLM_GATEWAY_API_KEY" | "SENTIMENT_MODEL">, recentTrades: ClosedTradeSummary[], recentAdjustments: WeightAdjustment[]): Promise<string | null> {
  if (recentTrades.length === 0) return null;

  const userPrompt = `Recent closed trades:
${recentTrades.map((t) => `- ${t.symbol} ${t.action}, realized return ${(t.realizedReturnPct * 100).toFixed(2)}%, closed ${t.closedAt}`).join("\n")}

Resulting weight adjustments:
${recentAdjustments.map((a) => `- ${a.key}: ${a.before.toFixed(3)} -> ${a.after.toFixed(3)} (${a.delta >= 0 ? "+" : ""}${a.delta.toFixed(3)})`).join("\n")}`;

  try {
    const raw = await callGatewayJson(env, REFLECTION_SYSTEM_PROMPT, userPrompt);
    return reflectionSchema.parse(raw).rationale;
  } catch {
    return null;
  }
}
