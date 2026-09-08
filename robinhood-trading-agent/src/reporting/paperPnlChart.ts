/**
 * Builds a cycle-end paper PnL snapshot + SVG bar chart for open
 * (unrealized) and recently closed (realized) positions.
 */

export interface MarkPrice {
  symbol: string;
  price: number;
}

export interface OpenPnlRow {
  status: "open";
  symbol: string;
  side: "BUY" | "SELL";
  entryPrice: number;
  markPrice: number;
  quantity: number;
  unrealizedReturnPct: number;
  unrealizedPnlUsd: number;
  openedAt: string;
}

export interface ClosedPnlRow {
  status: "closed";
  symbol: string;
  side: "BUY" | "SELL";
  realizedReturnPct: number;
  closedAt: string;
}

export type PnlRow = OpenPnlRow | ClosedPnlRow;

export interface PaperPnlSnapshot {
  generatedAt: string;
  open: OpenPnlRow[];
  closed: ClosedPnlRow[];
  totals: {
    openCount: number;
    closedCount: number;
    avgUnrealizedReturnPct: number | null;
    avgRealizedReturnPct: number | null;
    totalUnrealizedPnlUsd: number;
  };
  /** SVG bar chart (open = unrealized, closed = realized). Embed in markdown or write to .svg. */
  chartSvg: string;
  /** Compact markdown table for the cycle report. */
  markdownTable: string;
}

function unrealizedReturnPct(side: "BUY" | "SELL", entryPrice: number, markPrice: number): number {
  if (entryPrice <= 0) return 0;
  return side === "BUY" ? (markPrice - entryPrice) / entryPrice : (entryPrice - markPrice) / entryPrice;
}

function formatPct(value: number): string {
  const pct = value * 100;
  const sign = pct > 0 ? "+" : "";
  return `${sign}${pct.toFixed(2)}%`;
}

function escapeXml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function buildOpenRows(
  positions: Array<{ symbol: string; action: "BUY" | "SELL"; entryPrice: number; quantity: number; openedAt: string }>,
  marks: MarkPrice[],
): OpenPnlRow[] {
  const markMap = new Map(marks.map((m) => [m.symbol.toUpperCase(), m.price]));
  const rows: OpenPnlRow[] = [];
  for (const p of positions) {
    const mark = markMap.get(p.symbol.toUpperCase());
    if (mark === undefined || !(mark > 0)) continue;
    const pct = unrealizedReturnPct(p.action, p.entryPrice, mark);
    const notional = p.entryPrice * p.quantity;
    rows.push({
      status: "open",
      symbol: p.symbol,
      side: p.action,
      entryPrice: p.entryPrice,
      markPrice: mark,
      quantity: p.quantity,
      unrealizedReturnPct: pct,
      unrealizedPnlUsd: notional * pct,
      openedAt: p.openedAt,
    });
  }
  return rows.sort((a, b) => Math.abs(b.unrealizedReturnPct) - Math.abs(a.unrealizedReturnPct));
}

export function buildClosedRows(
  trades: Array<{ symbol: string; action: "BUY" | "SELL"; realizedReturnPct: number; closedAt: string }>,
  limit = 20,
): ClosedPnlRow[] {
  return trades
    .slice(-limit)
    .map((t) => ({
      status: "closed" as const,
      symbol: t.symbol,
      side: t.action,
      realizedReturnPct: t.realizedReturnPct,
      closedAt: t.closedAt,
    }))
    .reverse();
}

/** Horizontal bar chart: closed (realized) then open (unrealized). */
export function renderPnlChartSvg(open: OpenPnlRow[], closed: ClosedPnlRow[]): string {
  const rows: Array<{ label: string; pct: number; kind: "open" | "closed" }> = [
    ...closed.map((c) => ({
      label: `${c.symbol} ✕ ${c.side}`,
      pct: c.realizedReturnPct,
      kind: "closed" as const,
    })),
    ...open.map((o) => ({
      label: `${o.symbol} ○ ${o.side}`,
      pct: o.unrealizedReturnPct,
      kind: "open" as const,
    })),
  ];

  if (rows.length === 0) {
    return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="640" height="120" viewBox="0 0 640 120">
  <rect width="640" height="120" fill="#0f1419"/>
  <text x="24" y="64" fill="#8b98a5" font-family="ui-sans-serif,system-ui,sans-serif" font-size="16">No open or closed paper positions yet</text>
</svg>`;
  }

  const rowH = 28;
  const top = 48;
  const bottom = 28;
  const left = 150;
  const right = 72;
  const width = 720;
  const height = top + rows.length * rowH + bottom;
  const plotW = width - left - right;
  const maxAbs = Math.max(0.05, ...rows.map((r) => Math.abs(r.pct)));
  const midX = left + plotW / 2;

  const bars = rows
    .map((r, i) => {
      const y = top + i * rowH;
      const barW = (Math.abs(r.pct) / maxAbs) * (plotW / 2);
      const x = r.pct >= 0 ? midX : midX - barW;
      const fill = r.pct >= 0 ? "#0f9d58" : "#d93025";
      const opacity = r.kind === "open" ? "0.55" : "1";
      const pctLabel = formatPct(r.pct);
      const labelX = r.pct >= 0 ? x + barW + 6 : x - 6;
      const anchor = r.pct >= 0 ? "start" : "end";
      return `
  <text x="12" y="${y + 16}" fill="#e7e9ea" font-family="ui-sans-serif,system-ui,sans-serif" font-size="12">${escapeXml(r.label)}</text>
  <text x="12" y="${y + 26}" fill="#8b98a5" font-family="ui-sans-serif,system-ui,sans-serif" font-size="9">${r.kind === "open" ? "unrealized" : "realized"}</text>
  <rect x="${x.toFixed(1)}" y="${y + 4}" width="${Math.max(barW, 1).toFixed(1)}" height="16" rx="3" fill="${fill}" opacity="${opacity}"/>
  <text x="${labelX.toFixed(1)}" y="${y + 16}" text-anchor="${anchor}" fill="#e7e9ea" font-family="ui-sans-serif,system-ui,sans-serif" font-size="11">${pctLabel}</text>`;
    })
    .join("");

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="${width}" height="${height}" fill="#0f1419"/>
  <text x="12" y="22" fill="#e7e9ea" font-family="ui-sans-serif,system-ui,sans-serif" font-size="16" font-weight="600">Paper PnL — open (unrealized) &amp; closed (realized)</text>
  <text x="12" y="38" fill="#8b98a5" font-family="ui-sans-serif,system-ui,sans-serif" font-size="11">Solid = closed/realized · Faded = open/unrealized · ○ open · ✕ closed</text>
  <line x1="${midX}" y1="${top - 4}" x2="${midX}" y2="${height - bottom + 4}" stroke="#38444d" stroke-width="1"/>
  ${bars}
</svg>`;
}

export function renderPnlMarkdownTable(open: OpenPnlRow[], closed: ClosedPnlRow[]): string {
  const lines = [
    "| Status | Symbol | Side | Return | Detail |",
    "|---|---|---|---|---|",
  ];
  for (const c of closed) {
    lines.push(`| closed | ${c.symbol} | ${c.side} | ${formatPct(c.realizedReturnPct)} | realized @ ${c.closedAt.slice(0, 16)}Z |`);
  }
  for (const o of open) {
    lines.push(
      `| open | ${o.symbol} | ${o.side} | ${formatPct(o.unrealizedReturnPct)} | unrealized · entry ${o.entryPrice} → mark ${o.markPrice} · PnL $${o.unrealizedPnlUsd.toFixed(2)} |`,
    );
  }
  if (closed.length === 0 && open.length === 0) {
    lines.push("| — | — | — | — | no paper positions |");
  }
  return lines.join("\n");
}

export function buildPaperPnlSnapshot(input: {
  positions: Array<{ symbol: string; action: "BUY" | "SELL"; entryPrice: number; quantity: number; openedAt: string }>;
  recentClosed: Array<{ symbol: string; action: "BUY" | "SELL"; realizedReturnPct: number; closedAt: string }>;
  marks: MarkPrice[];
  closedLimit?: number;
}): PaperPnlSnapshot {
  const open = buildOpenRows(input.positions, input.marks);
  const closed = buildClosedRows(input.recentClosed, input.closedLimit ?? 20);
  const avg = (values: number[]) => (values.length ? values.reduce((a, b) => a + b, 0) / values.length : null);
  return {
    generatedAt: new Date().toISOString(),
    open,
    closed,
    totals: {
      openCount: open.length,
      closedCount: closed.length,
      avgUnrealizedReturnPct: avg(open.map((o) => o.unrealizedReturnPct)),
      avgRealizedReturnPct: avg(closed.map((c) => c.realizedReturnPct)),
      totalUnrealizedPnlUsd: open.reduce((s, o) => s + o.unrealizedPnlUsd, 0),
    },
    chartSvg: renderPnlChartSvg(open, closed),
    markdownTable: renderPnlMarkdownTable(open, closed),
  };
}
