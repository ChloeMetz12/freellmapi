import type { OhlcvBar } from "./types.js";

/**
 * Thin public-market crypto OHLCV helper. RobinHood_Trade exposes crypto
 * quotes/orders but not historicals (equities have `get_equity_historicals`),
 * so the orchestrator cannot feed `compute_decision` for BTC/ETH without
 * another bars source. This module fills that gap via Binance.US public
 * klines — no Robinhood OAuth, no API key. (api.binance.com returns HTTP 451
 * from US locations; api.binance.us does not.)
 *
 * Symbol forms accepted: `BTC-USD`, `BTCUSD`, `BTCUSDT`, `BTC`.
 */

const DEFAULT_INTERVAL = "1h";
const DEFAULT_LIMIT = 100;

/** Binance kline intervals we expose (subset of their public API). */
export const CRYPTO_HISTORICAL_INTERVALS = ["1m", "5m", "15m", "1h", "4h", "1d"] as const;
export type CryptoHistoricalInterval = (typeof CRYPTO_HISTORICAL_INTERVALS)[number];

export interface FetchCryptoHistoricalsInput {
  symbol: string;
  interval?: CryptoHistoricalInterval;
  /** Number of bars to return (Binance max 1000). Default 100. */
  limit?: number;
}

export interface FetchCryptoHistoricalsResult {
  symbol: string;
  binanceSymbol: string;
  interval: CryptoHistoricalInterval;
  source: "binance.us";
  bars: OhlcvBar[];
}

/** Map a Robinhood-style crypto symbol onto a Binance USDT pair. */
export function toBinanceSymbol(symbol: string): string {
  let s = symbol.trim().toUpperCase().replace(/[\s_/]/g, "");
  if (s.endsWith("-USD")) s = s.slice(0, -4);
  else if (s.endsWith("USD") && !s.endsWith("USDT")) s = s.slice(0, -3);
  if (!s.endsWith("USDT")) s = `${s}USDT`;
  if (!/^[A-Z0-9]{2,20}USDT$/.test(s)) {
    throw new Error(`Unsupported crypto symbol "${symbol}" — expected forms like BTC-USD, ETH, or BTCUSDT`);
  }
  return s;
}

type BinanceKline = [number, string, string, string, string, string, ...unknown[]];

/**
 * Fetches oldest-first OHLCV bars from Binance.US public klines, shaped for
 * `compute_decision` / `ohlcvBarSchema` (ISO-8601 timestamps with offset).
 */
export async function fetchCryptoHistoricals(input: FetchCryptoHistoricalsInput): Promise<FetchCryptoHistoricalsResult> {
  const interval = input.interval ?? DEFAULT_INTERVAL;
  const limit = input.limit ?? DEFAULT_LIMIT;
  if (limit < 21 || limit > 1000) {
    throw new Error(`limit must be between 21 and 1000 (got ${limit})`);
  }
  const binanceSymbol = toBinanceSymbol(input.symbol);
  const url = new URL("https://api.binance.us/api/v3/klines");
  url.searchParams.set("symbol", binanceSymbol);
  url.searchParams.set("interval", interval);
  url.searchParams.set("limit", String(limit));

  const response = await fetch(url);
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Binance.US klines fetch failed for ${binanceSymbol}: ${response.status} ${response.statusText}${body ? ` — ${body.slice(0, 200)}` : ""}`);
  }

  const raw = (await response.json()) as BinanceKline[];
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new Error(`Binance.US returned no klines for ${binanceSymbol}`);
  }

  const bars: OhlcvBar[] = raw.map((row) => {
    const [openTimeMs, open, high, low, close, volume] = row;
    return {
      // Offset form required by ohlcvBarSchema.datetime({ offset: true })
      timestamp: new Date(openTimeMs).toISOString().replace(/Z$/, "+00:00"),
      open: Number(open),
      high: Number(high),
      low: Number(low),
      close: Number(close),
      volume: Number(volume),
    };
  });

  return {
    symbol: input.symbol.trim().toUpperCase(),
    binanceSymbol,
    interval,
    source: "binance.us",
    bars,
  };
}
