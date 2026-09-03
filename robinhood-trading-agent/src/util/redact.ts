/** Strips API-key query params from a string before it's logged anywhere — a fetch-level error's message/stack can embed the full request URL, ?token=/?apiKey= value included. */
export function redactSecrets(text: string): string {
  return text.replace(/([?&](?:token|apiKey)=)[^&\s"']+/gi, "$1[REDACTED]");
}
