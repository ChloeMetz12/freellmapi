import type { Env } from "../config/env.js";

/**
 * Thin OpenAI-compatible chat-completions client. Defaults to this
 * monorepo's own `freellmapi` gateway (see plan: "News & LLM provider
 * choices") but works against any OpenAI-compatible endpoint, so swapping
 * to a direct provider is a config change (`LLM_GATEWAY_URL`), not a code
 * change.
 *
 * Every call here is expected to return strict JSON matching a schema the
 * caller validates — this client does not attempt to parse or salvage
 * free-form prose (see plan's "LLM prompting design": structured output,
 * not prose).
 */

// get_symbol_chatter is called from several parallel per-symbol pipelines
// within the same cycle (see docs/orchestration-prompt.md), all sharing
// this one gateway — a burst of concurrent calls routinely draws 429s from
// it. Without a retry here, every one of those calls degraded to neutral
// immediately, which was silently starving the social_chatter signal of
// real data on most cycles (observed: 80-90% of chatter calls degraded).
const MAX_ATTEMPTS = 3;
const BASE_DELAY_MS = 300;
// Cap how long a single call will wait on a gateway-supplied Retry-After —
// a saturated gateway can ask for a long cooldown, but this call is one
// step in a multi-symbol cycle with its own time budget, not a background
// job that can afford to sit idle for minutes.
const MAX_RETRY_AFTER_MS = 5_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// 429 (rate limit) and 5xx (transient server-side) are worth retrying — a
// 4xx like 400/401 means this exact request is malformed or unauthorized,
// and retrying it just burns another slot against the same rate limit
// without ever succeeding.
function isRetryableStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

function parseRetryAfterMs(header: string | null): number | null {
  if (!header) return null;
  const seconds = Number(header);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const dateMs = Date.parse(header);
  return Number.isFinite(dateMs) ? Math.max(0, dateMs - Date.now()) : null;
}

export async function callGatewayJson(env: Pick<Env, "LLM_GATEWAY_URL" | "LLM_GATEWAY_API_KEY" | "SENTIMENT_MODEL">, systemPrompt: string, userPrompt: string): Promise<unknown> {
  let lastError = new Error("callGatewayJson: no attempt made");

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const response = await fetch(`${env.LLM_GATEWAY_URL}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(env.LLM_GATEWAY_API_KEY ? { Authorization: `Bearer ${env.LLM_GATEWAY_API_KEY}` } : {}),
      },
      body: JSON.stringify({
        model: env.SENTIMENT_MODEL,
        response_format: { type: "json_object" },
        temperature: 0.2,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      }),
    });

    if (response.ok) {
      const body = (await response.json()) as { choices: Array<{ message: { content: string } }> };
      const content = body.choices?.[0]?.message?.content;
      if (!content) throw new Error("LLM gateway returned no content");
      return JSON.parse(content);
    }

    lastError = new Error(`LLM gateway call failed: ${response.status} ${response.statusText}`);

    // Drain the error body before retrying — an unconsumed body can pin
    // the underlying connection open (blocking reuse) in Node's fetch
    // implementation, which matters most exactly here, under the
    // concurrent 429/5xx bursts this loop exists to ride out.
    await response.body?.cancel().catch(() => {});

    if (!isRetryableStatus(response.status) || attempt === MAX_ATTEMPTS) throw lastError;

    // Honor the gateway's own Retry-After when it sends one (common on
    // 429s); otherwise fall back to exponential backoff. Jitter matters
    // specifically here: several parallel per-symbol pipelines can all hit
    // the 429 at the same instant, and without jitter they'd all retry at
    // the same instant too, immediately re-triggering the same burst.
    // The valid delay range is [minMs, maxMs]; jitter is sampled uniformly
    // across it rather than as a fixed extra fraction, since a fixed
    // extra amount on top of a Retry-After near the cap would blow past
    // the cap (e.g. Retry-After: 4 must land in [4000, 5000], not
    // [4000, 6000]).
    const retryAfterMs = parseRetryAfterMs(response.headers.get("retry-after"));
    let minMs: number;
    let maxMs: number;
    if (retryAfterMs === null) {
      minMs = BASE_DELAY_MS * 2 ** (attempt - 1);
      maxMs = minMs * 1.5;
    } else if (retryAfterMs <= MAX_RETRY_AFTER_MS) {
      // Within budget — Retry-After is the server telling us the minimum
      // wait, a floor jitter must not shorten. Jitter scales with the
      // header itself (same ~50% as the fallback backoff below), not with
      // the fixed cap — otherwise a small Retry-After (even 0) could still
      // jitter all the way up to MAX_RETRY_AFTER_MS, adding several
      // seconds of latency the server never asked for. The fallback
      // backoff's own jitter is used as a floor on the window so a very
      // small header still gets *some* spread to desynchronize concurrent
      // retries, and the whole window is capped so a header near the
      // budget still can't jitter past it.
      minMs = retryAfterMs;
      const fallbackJitterMs = BASE_DELAY_MS * 2 ** (attempt - 1) * 0.5;
      maxMs = Math.min(minMs + Math.max(minMs * 0.5, fallbackJitterMs), MAX_RETRY_AFTER_MS);
    } else {
      // Exceeds budget — scale the range down by the same ratio so the
      // result still tops out at the cap while keeping genuine spread.
      // Capping the post-jitter value directly would instead collapse
      // every caller with a large Retry-After to the exact same delay,
      // re-synchronizing the very burst jitter exists to break up.
      minMs = MAX_RETRY_AFTER_MS / 1.5;
      maxMs = MAX_RETRY_AFTER_MS;
    }
    await sleep(minMs + Math.random() * (maxMs - minMs));
  }

  // Unreachable — the loop above always returns or throws — but keeps this
  // function's control flow explicit rather than relying on that being
  // obvious to every future reader.
  throw lastError;
}
