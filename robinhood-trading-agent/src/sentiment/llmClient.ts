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
export async function callGatewayJson(env: Pick<Env, "LLM_GATEWAY_URL" | "LLM_GATEWAY_API_KEY" | "SENTIMENT_MODEL">, systemPrompt: string, userPrompt: string): Promise<unknown> {
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

  if (!response.ok) {
    throw new Error(`LLM gateway call failed: ${response.status} ${response.statusText}`);
  }

  const body = (await response.json()) as { choices: Array<{ message: { content: string } }> };
  const content = body.choices?.[0]?.message?.content;
  if (!content) throw new Error("LLM gateway returned no content");

  return JSON.parse(content);
}
