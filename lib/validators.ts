import { z } from 'zod';

export const ComexStockSchema = z.object({
  date: z.date(),
  totalRegistered: z.number().positive(),
  totalEligible: z.number().positive(),
  totalCombined: z.number().positive(),
  warehouses: z.array(z.object({
    warehouseName: z.string(),
    registered: z.number().nonnegative(),
    eligible: z.number().nonnegative(),
    deposits: z.number().optional(),
    withdrawals: z.number().optional(),
    adjustments: z.number().optional(),
  })).optional(),
});

export const SgePriceSchema = z.object({
  date: z.date(),
  priceCnyPerGram: z.number().positive(),
  priceUsdPerOz: z.number().positive(),
});

export const FxRateSchema = z.object({
  date: z.date(),
  usdCnyRate: z.number().positive(),
  source: z.string(),
});

export const ComexPriceSchema = z.object({
  date: z.date(),
  priceUsdPerOz: z.number().positive(),
  contract: z.string().optional(),
});

export type ComexStockData = z.infer<typeof ComexStockSchema>;
export type SgePriceData = z.infer<typeof SgePriceSchema>;
export type FxRateData = z.infer<typeof FxRateSchema>;
export type ComexPriceData = z.infer<typeof ComexPriceSchema>;
