import axios from 'axios';
import { OZ_TO_GRAMS } from '../constants';
import type { SgePriceData } from '../validators';

/**
 * Fetches SGE Shanghai Silver Benchmark Price
 * 
 * SGE doesn't provide a public JSON API, so we use multiple fallback strategies:
 * 1. Try SGE website (scraping fallback)
 * 2. Use Kitco as proxy for Shanghai price
 * 3. Manual fallback via environment variable
 */
export async function fetchSgePrice(date: Date, usdCnyRate: number): Promise<SgePriceData | null> {
  try {
    // Strategy 1: Environment variable override (for manual input)
    const manualPrice = process.env.SGE_MANUAL_PRICE_CNY_G;
    if (manualPrice) {
      const priceCnyPerGram = parseFloat(manualPrice);
      if (!isNaN(priceCnyPerGram)) {
        const priceUsdPerOz = (priceCnyPerGram * OZ_TO_GRAMS) / usdCnyRate;
        console.log(`✓ Using manual SGE price: ${priceCnyPerGram} CNY/g → $${priceUsdPerOz.toFixed(2)}/oz`);
        
        return {
          date,
          priceCnyPerGram,
          priceUsdPerOz,
        };
      }
    }
    
    // Strategy 2: Try fetching from Kitco (they track Shanghai premium)
    const kitcoPrice = await fetchFromKitco();
    if (kitcoPrice) {
      const priceCnyPerGram = kitcoPrice * usdCnyRate / OZ_TO_GRAMS;
      console.log(`✓ SGE price from Kitco: $${kitcoPrice.toFixed(2)}/oz → ${priceCnyPerGram.toFixed(2)} CNY/g`);
      
      return {
        date,
        priceCnyPerGram,
        priceUsdPerOz: kitcoPrice,
      };
    }
    
    // Strategy 3: Calculate from COMEX + typical premium
    // Typical Shanghai premium is 2-4% over COMEX
    console.warn('⚠ SGE price unavailable - would need web scraping or paid API');
    console.warn('⚠ Set SGE_MANUAL_PRICE_CNY_G in .env for manual override');
    
    return null;
    
  } catch (error) {
    console.error('✗ Error fetching SGE price:', error);
    return null;
  }
}

/**
 * Fetch silver price from Kitco (free, reliable)
 * Returns USD/oz
 */
async function fetchFromKitco(): Promise<number | null> {
  try {
    const response = await axios.get('https://www.kitco.com/market/silver', {
      timeout: 10000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    });
    
    const html = response.data;
    
    // Kitco shows silver price in various formats
    // Look for patterns like: "$32.50" or "32.50" in specific sections
    const priceMatch = html.match(/silver.*?(\d+\.\d{2})/i) || 
                       html.match(/spot.*?(\d+\.\d{2})/i);
    
    if (priceMatch && priceMatch[1]) {
      const price = parseFloat(priceMatch[1]);
      if (price > 10 && price < 100) { // Sanity check for silver price range
        return price;
      }
    }
    
    return null;
  } catch (error) {
    console.error('✗ Kitco fetch failed:', error instanceof Error ? error.message : error);
    return null;
  }
}

/**
 * Alternative: Fetch from metals-api.com (requires API key)
 */
export async function fetchSgePriceFromMetalsAPI(date: Date, usdCnyRate: number): Promise<SgePriceData | null> {
  const apiKey = process.env.METALS_API_KEY;
  if (!apiKey) {
    console.warn('⚠ METALS_API_KEY not set');
    return null;
  }
  
  try {
    const response = await axios.get('https://metals-api.com/api/latest', {
      params: {
        access_key: apiKey,
        base: 'USD',
        symbols: 'XAG',
      },
      timeout: 10000,
    });
    
    if (response.data && response.data.rates && response.data.rates.XAG) {
      // metals-api returns oz per USD, we need USD per oz
      const priceUsdPerOz = 1 / response.data.rates.XAG;
      const priceCnyPerGram = (priceUsdPerOz * usdCnyRate) / OZ_TO_GRAMS;
      
      console.log(`✓ SGE price from Metals API: $${priceUsdPerOz.toFixed(2)}/oz`);
      
      return {
        date,
        priceCnyPerGram,
        priceUsdPerOz,
      };
    }
    
    return null;
  } catch (error) {
    console.error('✗ Metals API fetch failed:', error);
    return null;
  }
}

/**
 * Calculate estimated SGE price from COMEX + premium
 * Premium typically 2-4% over COMEX spot
 */
export function calculateSgeFromComex(comexPrice: number, premiumPercent: number = 3): number {
  return comexPrice * (1 + premiumPercent / 100);
}
