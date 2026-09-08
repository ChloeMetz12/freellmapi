import { describe, it, expect } from "vitest";
import { buildPaperPnlSnapshot } from "../../src/reporting/paperPnlChart.js";

describe("paperPnlChart", () => {
  it("computes unrealized and realized rows and emits svg + markdown", () => {
    const snap = buildPaperPnlSnapshot({
      positions: [{ symbol: "AAPL", action: "BUY", entryPrice: 100, quantity: 2, openedAt: "2026-09-08T14:00:00.000Z" }],
      recentClosed: [{ symbol: "MSFT", action: "SELL", realizedReturnPct: -0.05, closedAt: "2026-09-08T15:00:00.000Z" }],
      marks: [{ symbol: "AAPL", price: 110 }],
    });
    expect(snap.open).toHaveLength(1);
    expect(snap.open[0].unrealizedReturnPct).toBeCloseTo(0.1, 10);
    expect(snap.open[0].unrealizedPnlUsd).toBeCloseTo(20, 10);
    expect(snap.closed).toHaveLength(1);
    expect(snap.chartSvg).toContain("<svg");
    expect(snap.chartSvg).toContain("AAPL");
    expect(snap.markdownTable).toContain("unrealized");
    expect(snap.markdownTable).toContain("realized");
  });

  it("omits open rows without a mark price", () => {
    const snap = buildPaperPnlSnapshot({
      positions: [{ symbol: "NVDA", action: "BUY", entryPrice: 100, quantity: 1, openedAt: "2026-09-08T14:00:00.000Z" }],
      recentClosed: [],
      marks: [],
    });
    expect(snap.open).toHaveLength(0);
  });
});
