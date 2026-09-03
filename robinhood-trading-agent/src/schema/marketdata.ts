import { z } from "zod";

export const ohlcvBarSchema = z.object({
  // A real ISO datetime, not any string — an unparseable timestamp would
  // otherwise pass schema validation and only get caught later (if at
  // all) by assertSortedAscending's own NaN guard.
  timestamp: z.string().datetime({ offset: true }),
  open: z.number().finite(),
  high: z.number().finite(),
  low: z.number().finite(),
  close: z.number().finite(),
  volume: z.number().finite(),
});

export const assetClassSchema = z.enum(["equity", "crypto"]);

export const marketTrendSchema = z.object({
  broadMarketChangePct: z.number().finite(),
  techChangePct: z.number().finite(),
  volatilityIndex: z.number().finite(),
});
