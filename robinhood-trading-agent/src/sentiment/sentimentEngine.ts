import { z } from "zod";
import type { Env } from "../config/env.js";
import { redactSecrets } from "../util/redact.js";
import { callGatewayJson } from "./llmClient.js";
import { FinnhubMarketNews } from "./providers/finnhubMarketNews.js";
import { NewsApiWorldNews } from "./providers/newsApiWorldNews.js";
import { CoinGeckoMarket } from "./providers/coinGeckoMarket.js";
import { BenzingaNews } from "./providers/benzingaNews.js";
import { XMacroNews } from "./providers/xMacroNews.js";
import { NEUTRAL_SENTIMENT, type MarketTrendSnapshot, type NewsHeadline, type SentimentResult } from "./types.js";

const SYSTEM_PROMPT = `You analyze market-relevant news and macro/political context for sentiment
that could affect near-term equity and crypto prices. You never recommend a
specific trade, ticker action, or position size — that is out of scope and
handled by a separate deterministic system.

Reason step by step before answering:
1. For each headline, note the claim, how reliable the source looks, and
   whether it is corroborated or a single, sensational, unverified report.
2. Weigh the plausible market impact of each claim, if any.
3. Combine with the market-trend snapshot provided.
4. Only then decide a final bounded score.

Default to a neutral, low-confidence score when headlines are ambiguous,
unverified, or come from a single low-quality source — do not overreact to
one sensational headline. Respond with ONLY a JSON object (no markdown
fences) matching this shape:
{
  "scratchpad": "<your step-by-step reasoning from above>",
  "score": <number from -1 (very bearish/high risk) to 1 (very bullish/low risk)>,
  "confidence": <number from 0 to 1>,
  "rationale": "<one or two sentences, concrete and falsifiable, e.g. citing the specific headline/indicator that moved the score>"
}

Example of a good rationale: "Fed signaled a possible rate cut per two
corroborating wire reports; VIX down 8% today; score leans mildly bullish."
Example of a bad rationale (too vague, avoid this style): "News seems
generally positive for markets today."`;

const sentimentSchema = z.object({
  scratchpad: z.string(),
  score: z.number().min(-1).max(1),
  confidence: z.number().min(0).max(1),
  rationale: z.string(),
});

function buildUserPrompt(marketTrend: MarketTrendSnapshot, headlines: NewsHeadline[]): string {
  const headlineLines = headlines.length > 0 ? headlines.map((h) => `- [${h.source}, ${h.publishedAt}] ${h.title}`).join("\n") : "(no headlines available this cycle)";
  return `Market trend snapshot:
- Broad market (SPY) change: ${marketTrend.broadMarketChangePct.toFixed(2)}%
- Tech (QQQ) change: ${marketTrend.techChangePct.toFixed(2)}%
- VIX level: ${marketTrend.volatilityIndex.toFixed(2)}

Recent headlines (financial + world/political):
${headlineLines}`;
}

/** Exported for direct unit testing of the secret-redaction behavior below — not part of the module's intended external API otherwise. */
export async function safelyFetch(name: string, fn: () => Promise<NewsHeadline[]>): Promise<NewsHeadline[]> {
  try {
    return await fn();
  } catch (err) {
    // Never put the raw error message into content that reaches the LLM
    // prompt or the audit log: both providers embed their API key as a
    // URL query parameter (?token=.../?apiKey=...), and a fetch-level
    // network error (Node/undici) can include the full request URL in its
    // message — that must never flow into a headline title the LLM reads
    // and the audit log records. Log the real error server-side only.
    const detail = err instanceof Error ? redactSecrets(`${err.message}${err.stack ? `\n${err.stack}` : ""}`) : redactSecrets(String(err));
    console.error(`[sentiment] ${name} fetch failed:`, detail);
    // A single provider failing degrades that provider's input, not the
    // whole sentiment read — the LLM still sees whatever the other
    // provider returned, and gets told this one was unavailable.
    return [{ title: `(${name} unavailable)`, source: name, publishedAt: new Date().toISOString(), url: "" }];
  }
}

export interface SentimentEngineDeps {
  env: Pick<Env, "LLM_GATEWAY_URL" | "LLM_GATEWAY_API_KEY" | "SENTIMENT_MODEL" | "FINNHUB_API_KEY" | "NEWSAPI_KEY" | "BENZINGA_API_KEY" | "X_BEARER_TOKEN" | "COINGECKO_API_KEY">;
}

export async function computeSentiment(marketTrend: MarketTrendSnapshot, { env }: SentimentEngineDeps): Promise<SentimentResult> {
  const providers = [
    env.FINNHUB_API_KEY ? () => safelyFetch("finnhub", () => new FinnhubMarketNews(env.FINNHUB_API_KEY!).fetchHeadlines()) : null,
    env.NEWSAPI_KEY ? () => safelyFetch("newsapi", () => new NewsApiWorldNews(env.NEWSAPI_KEY!).fetchHeadlines()) : null,
    env.BENZINGA_API_KEY ? () => safelyFetch("benzinga", () => new BenzingaNews(env.BENZINGA_API_KEY!).fetchHeadlines()) : null,
    env.X_BEARER_TOKEN ? () => safelyFetch("x-macro", () => new XMacroNews(env.X_BEARER_TOKEN!).fetchHeadlines()) : null,
    // CoinGecko needs no key for its free-tier market endpoints used here.
    () => safelyFetch("coingecko", () => new CoinGeckoMarket(env.COINGECKO_API_KEY).fetchHeadlines()),
  ].filter((p): p is () => Promise<NewsHeadline[]> => p !== null);

  if (providers.length === 0) {
    return NEUTRAL_SENTIMENT("no news provider API keys configured");
  }

  const headlineLists = await Promise.all(providers.map((p) => p()));
  const headlines = headlineLists.flat();

  try {
    const raw = await callGatewayJson(env, SYSTEM_PROMPT, buildUserPrompt(marketTrend, headlines));
    const parsed = sentimentSchema.parse(raw);
    return { ...parsed, degraded: false };
  } catch (err) {
    return NEUTRAL_SENTIMENT(`LLM sentiment call failed or returned invalid output: ${(err as Error).message}`);
  }
}
