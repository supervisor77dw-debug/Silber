import { fetchSgePriceWithProviders, type SgePriceNormalized } from '../providers/sgePriceProvider';
import type { SgePriceData } from '../validators';

/**
 * Fetches SGE Shanghai Silver Benchmark Price
 * 
 * Uses multi-provider system with automatic fallback:
 * 1. Metals-API (XAG/CNY)
 * 2. TwelveData (XAG/USD)
 * 3. Manual ENV override
 * 4. COMEX + Shanghai premium estimation
 */
export async function fetchSgePrice(
  date: Date, 
  usdCnyRate: number,
  comexPriceUsd?: number | null
): Promise<(SgePriceData & { metadata: SgePriceNormalized }) | null> {
  try {
    const result = await fetchSgePriceWithProviders(date, usdCnyRate, comexPriceUsd);
    
    if (!result) {
      console.error('✗ All SGE providers failed');
      return null;
    }

    console.log(`✓ SGE price: ${result.priceUsdPerOz.toFixed(2)} USD/oz from ${result.source}${result.isEstimated ? ' (estimated)' : ''}`);
    
    return {
      date,
      priceCnyPerGram: result.priceCnyPerGram,
      priceUsdPerOz: result.priceUsdPerOz,
      metadata: result, // Full provider metadata for DB storage
    };
    
  } catch (error) {
    console.error('✗ Error fetching SGE price:', error);
    return null;
  }
}

/**
 * Legacy function - kept for backward compatibility
 * @deprecated Use fetchSgePrice instead
 */
export async function fetchSgePriceFromMetalsAPI(date: Date, usdCnyRate: number): Promise<SgePriceData | null> {
  return fetchSgePrice(date, usdCnyRate);
}

/**
 * Calculate estimated SGE price from COMEX + premium
 * @deprecated Moved to sgePriceProvider
 */
export function calculateSgeFromComex(comexPrice: number, premiumPercent: number = 3): number {
  return comexPrice * (1 + premiumPercent / 100);
}
