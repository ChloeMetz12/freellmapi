/**
 * Redact account/P&L/credential-shaped text before any lesson leaves
 * STATE_DIR (e.g. curated Obsidian export). Lessons should describe
 * process ("don't retry dead source X", "thesis Y failed on catalyst Z"),
 * not balances, sizes, or secrets — this is a second line of defense.
 */

const PATTERNS: Array<{ re: RegExp; replacement: string }> = [
  // Currency / P&L figures
  { re: /\$\s?-?\d[\d,]*(?:\.\d+)?/g, replacement: "[amount]" },
  { re: /\b-?\d[\d,]*(?:\.\d+)?\s?(?:USD|usd|USDT|usdt)\b/g, replacement: "[amount]" },
  { re: /\b(?:pnl|P&L|profit|loss|equity|buying\s*power|cash|balance)\b\s*[:=]?\s*-?\d[\d,]*(?:\.\d+)?%?/gi, replacement: "[redacted-balance]" },
  // Share / contract quantities next to action verbs
  { re: /\b(?:bought|sold|shorted|sized|shares?|contracts?|qty|quantity|units?)\b\s*[:=]?\s*-?\d[\d,]*(?:\.\d+)?/gi, replacement: "[redacted-size]" },
  { re: /\b-?\d[\d,]*(?:\.\d+)?\s*(?:shares?|contracts?)\b/gi, replacement: "[redacted-size]" },
  // Account / routing identifiers
  { re: /\b(?:account(?:_?number)?|rhs_account(?:_?number)?|portfolio_id|order_id|client_order_id)\b\s*[:=]?\s*\S+/gi, replacement: "[redacted-id]" },
  { re: /\b\d{8,}\b/g, replacement: "[redacted-id]" },
  // Credentials / tokens
  { re: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, replacement: "[redacted-email]" },
  { re: /\b(?:Bearer|bearer)\s+[A-Za-z0-9._\-/=+]{8,}/g, replacement: "Bearer [redacted-token]" },
  { re: /\b(?:api[_-]?key|access[_-]?token|refresh[_-]?token|secret|password|passwd)\b\s*[:=]\s*\S+/gi, replacement: "[redacted-secret]" },
  // Absolute filesystem paths (vault + home) — avoid leaking host layout
  { re: /(?:\/Users\/[^\s"'`]+|~\/[^\s"'`]+)/g, replacement: "[path]" },
];

export function sanitizeLessonText(text: string): string {
  let out = text;
  for (const { re, replacement } of PATTERNS) {
    out = out.replace(re, replacement);
  }
  // Collapse whitespace left by redactions
  return out.replace(/[ \t]{2,}/g, " ").replace(/\n{3,}/g, "\n\n").trim();
}
