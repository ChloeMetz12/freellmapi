import { describe, it, expect, vi, afterEach } from "vitest";
import { fetchCryptoHistoricals, toBinanceSymbol } from "../../src/marketdata/cryptoHistoricals.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("toBinanceSymbol", () => {
  it("maps Robinhood-style and bare symbols onto USDT pairs", () => {
    expect(toBinanceSymbol("BTC-USD")).toBe("BTCUSDT");
    expect(toBinanceSymbol("eth")).toBe("ETHUSDT");
    expect(toBinanceSymbol("BTCUSDT")).toBe("BTCUSDT");
    expect(toBinanceSymbol("SOL_USD")).toBe("SOLUSDT");
  });

  it("rejects garbage", () => {
    expect(() => toBinanceSymbol("$$$")).toThrow(/Unsupported/);
  });
});

describe("fetchCryptoHistoricals", () => {
  it("returns oldest-first OHLCV bars shaped for compute_decision", async () => {
    const klines = [
      [1_700_000_000_000, "100", "110", "90", "105", "12.5"],
      [1_700_003_600_000, "105", "120", "100", "115", "20"],
    ];
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => klines,
      })),
    );

    const result = await fetchCryptoHistoricals({ symbol: "BTC-USD", interval: "1h", limit: 50 });
    expect(result.binanceSymbol).toBe("BTCUSDT");
    expect(result.source).toBe("binance.us");
    expect(result.bars).toHaveLength(2);
    expect(result.bars[0]).toEqual({
      timestamp: "2023-11-14T22:13:20.000+00:00",
      open: 100,
      high: 110,
      low: 90,
      close: 105,
      volume: 12.5,
    });
    expect(result.bars[1].close).toBe(115);
    expect(new Date(result.bars[0].timestamp).getTime()).toBeLessThan(new Date(result.bars[1].timestamp).getTime());
  });

  it("surfaces Binance HTTP errors", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: false,
        status: 400,
        statusText: "Bad Request",
        text: async () => '{"code":-1121,"msg":"Invalid symbol."}',
      })),
    );
    await expect(fetchCryptoHistoricals({ symbol: "NOPE-USD" })).rejects.toThrow(/Binance\.US klines fetch failed/);
  });
});
