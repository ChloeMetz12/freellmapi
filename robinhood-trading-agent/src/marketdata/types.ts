/**
 * OHLCV bar. This package never fetches these itself (see README —
 * `RobinHood_Trade`'s OAuth grant is scoped to the calling Claude session,
 * not this server); the caller passes bars it already fetched via that
 * connector's quote/history tools into compute_decision.
 */
export interface OhlcvBar {
  /** ISO 8601 timestamp of the bar's open. */
  timestamp: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export function assertSortedAscending(bars: OhlcvBar[]): void {
  for (let i = 0; i < bars.length; i++) {
    // An invalid timestamp parses to NaN, and NaN < NaN (and NaN > NaN)
    // are both false — the ordering comparison below would silently never
    // trigger for it, letting unsorted/garbage data straight through to
    // indicators that assume valid, ordered timestamps.
    if (Number.isNaN(new Date(bars[i].timestamp).getTime())) {
      throw new Error(`OHLCV bar ${i} has an unparseable timestamp: ${bars[i].timestamp}`);
    }
  }
  for (let i = 1; i < bars.length; i++) {
    if (new Date(bars[i].timestamp).getTime() < new Date(bars[i - 1].timestamp).getTime()) {
      throw new Error(`OHLCV bars must be sorted oldest-first; bar ${i} (${bars[i].timestamp}) precedes bar ${i - 1} (${bars[i - 1].timestamp})`);
    }
  }
}
