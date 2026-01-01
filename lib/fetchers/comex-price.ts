import axios from 'axios';
import type { ComexPriceData } from '../validators';

/**
 * Fetches COMEX silver spot price using multiple strategies
 * 
 * Sources (in priority order):
 * 1. metals-api.com (free tier: 50 req/month)
 * 2. Metals.dev API (free, no auth)
 * 3. Yahoo Finance XAGUSD proxy
 * 4. Manual override via environment variable
 */
export async function fetchComexSpotPrice(date: Date): Promise<ComexPriceData | null> {
  // Strategy 1: Manual override
  const manualPrice = process.env.COMEX_MANUAL_SPOT_USD_OZ;
  if (manualPrice) {
    const price = parseFloat(manualPrice);
    if (!isNaN(price) && price > 10 && price < 100) {
      console.log(`✓ Using manual COMEX spot: $${price.toFixed(2)}/oz`);
      return {
        date,
        priceUsdPerOz: price,
        contract: 'Spot (manual)',
      };
    }
  }
  
  // Strategy 2: metals-api.com (requires API key)
  const metalsApiResult = await fetchFromMetalsAPI(date);
  if (metalsApiResult) {
    return metalsApiResult;
  }
  
  // Strategy 3: metals.dev (free, no auth required)
  const metalsDevResult = await fetchFromMetalsDev(date);
  if (metalsDevResult) {
    return metalsDevResult;
  }
  
  // Strategy 4: Yahoo Finance (scraping fallback)
  const yahooResult = await fetchFromYahooFinance(date);
  if (yahooResult) {
    return yahooResult;
  }
  
  console.error('✗ All COMEX price sources failed');
  console.warn('⚠ Set COMEX_MANUAL_SPOT_USD_OZ in .env for manual override');
  
  return null;
}

/**
 * Fetch from metals-api.com (requires API key)
 */
async function fetchFromMetalsAPI(date: Date): Promise<ComexPriceData | null> {
  const apiKey = process.env.METALS_API_KEY;
  if (!apiKey) {
    return null; // Skip silently
  }
  
  try {
    const response = await axios.get('https://metals-api.com/api/latest', {
      params: {
        access_key: apiKey,
        base: 'USD',
        symbols: 'XAG', // Silver symbol
      },
      timeout: 10000,
    });
    
    if (response.data?.rates?.XAG) {
      // metals-api returns oz per USD, we need USD per oz
      const priceUsdPerOz = 1 / response.data.rates.XAG;
      
      console.log(`✓ COMEX spot from Metals API: $${priceUsdPerOz.toFixed(2)}/oz`);
      
      return {
        date,
        priceUsdPerOz,
        contract: 'Spot (metals-api)',
      };
    }
    
    return null;
  } catch (error) {
    console.error('✗ Metals API failed:', error instanceof Error ? error.message : error);
    return null;
  }
}

/**
 * Fetch from metals.dev (free, no auth)
 */
async function fetchFromMetalsDev(date: Date): Promise<ComexPriceData | null> {
  try {
    const response = await axios.get('https://api.metals.dev/v1/latest', {
      params: {
        api_key: 'demo', // Free demo key
        currency: 'USD',
        unit: 'toz', // troy ounce
      },
      timeout: 10000,
      headers: {
        'User-Agent': 'Mozilla/5.0',
      },
    });
    
    if (response.data?.metals?.silver) {
      const priceUsdPerOz = response.data.metals.silver;
      
      console.log(`✓ COMEX spot from Metals.dev: $${priceUsdPerOz.toFixed(2)}/oz`);
      
      return {
        date,
        priceUsdPerOz,
        contract: 'Spot (metals.dev)',
      };
    }
    
    return null;
  } catch (error) {
    console.error('✗ Metals.dev failed:', error instanceof Error ? error.message : error);
    return null;
  }
}

/**
 * Fetch from Yahoo Finance (XAGUSD pair)
 */
async function fetchFromYahooFinance(date: Date): Promise<ComexPriceData | null> {
  try {
    // Yahoo Finance API endpoint for silver spot
    const response = await axios.get('https://query1.finance.yahoo.com/v8/finance/chart/SI=F', {
      timeout: 10000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    });
    
    const chart = response.data?.chart?.result?.[0];
    if (chart?.meta?.regularMarketPrice) {
      const priceUsdPerOz = chart.meta.regularMarketPrice;
      
      console.log(`✓ COMEX spot from Yahoo Finance: $${priceUsdPerOz.toFixed(2)}/oz`);
      
      return {
        date,
        priceUsdPerOz,
        contract: 'Spot (Yahoo)',
      };
    }
    
    return null;
  } catch (error) {
    console.error('✗ Yahoo Finance failed:', error instanceof Error ? error.message : error);
    return null;
  }
}

/**
 * Fetch with retry logic
 */
export async function fetchComexSpotPriceWithRetry(date: Date, maxRetries = 2): Promise<ComexPriceData | null> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const result = await fetchComexSpotPrice(date);
    if (result) {
      return result;
    }
    
    if (attempt < maxRetries - 1) {
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }
  
  return null;
}

/**
 * Alternative: Manual input or cached value
 */
export async function setComexSpotPrice(date: Date, priceUsdPerOz: number): Promise<ComexPriceData> {
  return {
    date,
    priceUsdPerOz,
    contract: 'Spot',
  };
}
