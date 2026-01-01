import axios from 'axios';
import { DATA_SOURCES } from '../constants';
import type { FxRateData } from '../validators';

/**
 * Fetches USD/CNY FX rate from exchangerate.host (free, reliable)
 */
export async function fetchFxRate(date: Date): Promise<FxRateData | null> {
  try {
    const response = await axios.get(DATA_SOURCES.FX_API, {
      params: {
        base: 'USD',
        symbols: 'CNY',
      },
      timeout: 10000,
      headers: {
        'User-Agent': 'Mozilla/5.0',
      },
    });

    if (response.data && response.data.rates && response.data.rates.CNY) {
      console.log(`✓ FX rate (USD/CNY): ${response.data.rates.CNY} from exchangerate.host`);
      
      return {
        date,
        usdCnyRate: response.data.rates.CNY,
        source: 'exchangerate.host',
      };
    }

    console.warn('⚠ FX rate not found in response, trying ECB fallback');
    return fetchFxRateFromECB(date);
  } catch (error) {
    console.error('✗ Error fetching FX rate from exchangerate.host:', error instanceof Error ? error.message : error);
    // Fallback to ECB
    return fetchFxRateFromECB(date);
  }
}

/**
 * Fallback: Fetches USD/CNY from European Central Bank
 */
export async function fetchFxRateFromECB(date: Date): Promise<FxRateData | null> {
  try {
    const response = await axios.get(DATA_SOURCES.ECB_FX, {
      timeout: 10000,
      headers: {
        'User-Agent': 'Mozilla/5.0',
      },
    });

    const xmlData = response.data;
    
    // Parse XML response - ECB provides EUR-based rates
    // We need CNY/EUR and USD/EUR to calculate USD/CNY
    const cnyMatch = xmlData.match(/<Cube currency=['"]CNY['"] rate=['"]?([\d.]+)['"]?/i);
    const usdMatch = xmlData.match(/<Cube currency=['"]USD['"] rate=['"]?([\d.]+)['"]?/i);
    
    if (cnyMatch && usdMatch) {
      const eurCnyRate = parseFloat(cnyMatch[1]);
      const eurUsdRate = parseFloat(usdMatch[1]);
      
      // USD/CNY = (CNY/EUR) / (USD/EUR)
      const usdCnyRate = eurCnyRate / eurUsdRate;
      
      console.log(`✓ FX rate (USD/CNY): ${usdCnyRate.toFixed(4)} from ECB`);
      
      return {
        date,
        usdCnyRate,
        source: 'ECB',
      };
    }

    console.error('✗ Could not parse FX rates from ECB XML');
    return null;
  } catch (error) {
    console.error('✗ Error fetching FX rate from ECB:', error instanceof Error ? error.message : error);
    return null;
  }
}

/**
 * Alternative: Fetch from frankfurter.app (free, open-source)
 */
export async function fetchFxRateFromFrankfurter(date: Date): Promise<FxRateData | null> {
  try {
    const response = await axios.get('https://api.frankfurter.app/latest', {
      params: {
        from: 'USD',
        to: 'CNY',
      },
      timeout: 10000,
    });

    if (response.data && response.data.rates && response.data.rates.CNY) {
      console.log(`✓ FX rate (USD/CNY): ${response.data.rates.CNY} from Frankfurter`);
      
      return {
        date,
        usdCnyRate: response.data.rates.CNY,
        source: 'Frankfurter',
      };
    }

    return null;
  } catch (error) {
    console.error('✗ Frankfurter fetch failed:', error instanceof Error ? error.message : error);
    return null;
  }
}

/**
 * Fetches FX rate with retry logic and multiple sources
 */
export async function fetchFxRateWithRetry(date: Date, maxRetries = 3): Promise<FxRateData | null> {
  const sources = [
    () => fetchFxRate(date),
    () => fetchFxRateFromFrankfurter(date),
    () => fetchFxRateFromECB(date),
  ];
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    // Try each source in order
    for (const fetchFunc of sources) {
      try {
        const result = await fetchFunc();
        if (result && result.usdCnyRate > 0) {
          return result;
        }
      } catch (error) {
        // Continue to next source
        continue;
      }
    }
    
    // Wait before retry
    if (attempt < maxRetries - 1) {
      await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
    }
  }
  
  console.error('✗ All FX rate sources failed after retries');
  return null;
}
