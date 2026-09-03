import { z } from "zod";
import type { Env } from "../config/env.js";
import { redactSecrets } from "../util/redact.js";
import { callGatewayJson } from "../sentiment/llmClient.js";
import { StockTwitsSymbolChatter } from "./providers/stockTwits.js";
import { XTickerChatter } from "./providers/xTickerChatter.js";
import { NEUTRAL_CHATTER, type ChatterMessage, type SymbolChatterResult } from "./types.js";

const SYSTEM_PROMPT = `You read StockTwits and X (Twitter) posts mentioning a single stock/crypto
ticker and assess the chatter's sentiment and reliability. You never
recommend a specific trade, position size, or action — that is out of
scope and handled by a separate deterministic system.

This input is the single most manipulable signal available to you:
coordinated pump-and-dump schemes, bot networks, and low-float squeezes
concentrate exactly in ticker-specific social chatter. Reason step by step
before answering:
1. How many distinct-sounding voices are actually saying something, versus
   one claim being repeated/copy-pasted across many posts (a strong pump
   signature)?
2. Does the chatter cite anything verifiable (an earnings date, a filed
   document, a named catalyst) or is it pure hype/emoji/price-target
   shouting with no substance?
3. Do StockTwits' own author-supplied bullish/bearish tags actually agree
   with the tone of the free-text messages, or diverge?
4. Only then decide a final bounded score — default to neutral, low
   confidence whenever the chatter looks thin, repetitive, or
   hype-without-substance, even if it's one-sided.

Respond with ONLY a JSON object (no markdown fences) matching this shape:
{
  "scratchpad": "<your step-by-step reasoning from above>",
  "score": <number from -1 (very bearish chatter) to 1 (very bullish chatter)>,
  "confidence": <number from 0 to 1>,
  "rationale": "<one or two sentences, concrete and falsifiable>"
}

Example of a good rationale: "12 distinct posts citing tomorrow's earnings
call, tags split 8 bullish/4 bearish — genuine but modest bullish lean."
Example of a bad rationale to avoid: "Chatter is very bullish right now."`;

const chatterSchema = z.object({
  scratchpad: z.string(),
  score: z.number().min(-1).max(1),
  confidence: z.number().min(0).max(1),
  rationale: z.string(),
});

function buildUserPrompt(symbol: string, messages: ChatterMessage[]): string {
  if (messages.length === 0) return `No StockTwits or X chatter found for ${symbol} in this cycle.`;
  const lines = messages.map((m) => `- [${m.source}${m.authorSentimentTag ? `, self-tagged ${m.authorSentimentTag}` : ""}] ${m.text}`).join("\n");
  return `Ticker: ${symbol}\n\nRecent chatter (${messages.length} messages):\n${lines}`;
}

async function safelyFetch(name: string, symbol: string, fn: () => Promise<ChatterMessage[]>): Promise<ChatterMessage[]> {
  try {
    return await fn();
  } catch (err) {
    const detail = err instanceof Error ? redactSecrets(`${err.message}${err.stack ? `\n${err.stack}` : ""}`) : redactSecrets(String(err));
    console.error(`[social] ${name} fetch failed for ${symbol}:`, detail);
    return [];
  }
}

export interface ChatterEngineDeps {
  env: Pick<Env, "LLM_GATEWAY_URL" | "LLM_GATEWAY_API_KEY" | "SENTIMENT_MODEL" | "X_BEARER_TOKEN">;
}

export async function computeSymbolChatter(symbol: string, { env }: ChatterEngineDeps): Promise<SymbolChatterResult> {
  const fetchers = [() => safelyFetch("stocktwits", symbol, () => new StockTwitsSymbolChatter().fetchMessages(symbol)), env.X_BEARER_TOKEN ? () => safelyFetch("x", symbol, () => new XTickerChatter(env.X_BEARER_TOKEN!).fetchMessages(symbol)) : null].filter((f): f is () => Promise<ChatterMessage[]> => f !== null);

  const messageLists = await Promise.all(fetchers.map((f) => f()));
  const messages = messageLists.flat();

  if (messages.length === 0) {
    return NEUTRAL_CHATTER(symbol, "no StockTwits/X chatter available this cycle");
  }

  try {
    const raw = await callGatewayJson(env, SYSTEM_PROMPT, buildUserPrompt(symbol, messages));
    const parsed = chatterSchema.parse(raw);
    return { symbol, ...parsed, messageCount: messages.length, degraded: false };
  } catch (err) {
    return NEUTRAL_CHATTER(symbol, `LLM chatter call failed or returned invalid output: ${(err as Error).message}`);
  }
}
