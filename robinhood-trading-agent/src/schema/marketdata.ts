import { z } from "zod";

export const ohlcvBarSchema = z.object({
  timestamp: z.string(),
  open: z.number(),
  high: z.number(),
  low: z.number(),
  close: z.number(),
  volume: z.number(),
});

export const assetClassSchema = z.enum(["equity", "crypto"]);

export const marketTrendSchema = z.object({
  broadMarketChangePct: z.number(),
  techChangePct: z.number(),
  volatilityIndex: z.number(),
});
