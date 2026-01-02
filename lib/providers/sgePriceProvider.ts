/**
 * SGE (Shanghai Gold Exchange) Silver Price Provider
 * 
 * Provides multiple data sources with fallback logic to fetch
 * the Shanghai silver benchmark price and convert it to USD/oz
 */

import axios from 'axios';
import { OZ_TO_GRAMS } from '../constants';

export interface SgePriceRaw {
  price: number;
  currency: 'CNY' | 'USD';
  unit: 'g' | 'kg' | 'oz';
  source: string;
  timestamp: Date;
  symbol?: string;
  rawResponse?: any;
}

export interface SgePriceNormalized {
  date: Date;
  priceCnyPerGram: number;
  priceUsdPerOz: number;
  source: string;
  fxRateUsed: number;
  isEstimated: boolean;
  conversionSteps: string[];
  rawData: SgePriceRaw;
}

/**
 * Provider A: Metals-API with XAG-CNY
 * Most reliable for SGE silver prices
 */
export async function fetchFromMetalsAPI(date: Date, usdCnyRate: number): Promise<SgePriceNormalized | null> {
  const apiKey = process.env.METALS_API_KEY;
  if (!apiKey) {
    console.log('[SGE Provider A] METALS_API_KEY not configured');
    return null;
  }

  try {
    const conversionSteps: string[] = [];
    
    // Fetch CNY price for silver (XAG)
    const response = await axios.get('https://metals-api.com/api/latest', {
      params: {
        access_key: apiKey,
        base: 'CNY',
        symbols: 'XAG',
      },
      timeout: 10000,
    });

    conversionSteps.push(`API Request: GET metals-api.com/api/latest?base=CNY&symbols=XAG`);
    
    if (!response.data?.rates?.XAG) {
      console.log('[SGE Provider A] No XAG rate in response');
      return null;
    }

    // Metals-API returns: 1 CNY = X oz of silver
    // We need: 1 g of silver = Y CNY
    const ozPerCny = response.data.rates.XAG;
    conversionSteps.push(`Raw response: 1 CNY = ${ozPerCny} oz XAG`);
    
    const cnyPerOz = 1 / ozPerCny;
    conversionSteps.push(`Inverted: 1 oz XAG = ${cnyPerOz.toFixed(2)} CNY`);
    
    const cnyPerGram = cnyPerOz / OZ_TO_GRAMS;
    conversionSteps.push(`Convert to grams: ${cnyPerOz.toFixed(2)} / ${OZ_TO_GRAMS} = ${cnyPerGram.toFixed(4)} CNY/g`);
    
    const usdPerOz = (cnyPerGram * OZ_TO_GRAMS) / usdCnyRate;
    conversionSteps.push(`Convert to USD/oz: (${cnyPerGram.toFixed(4)} * ${OZ_TO_GRAMS}) / ${usdCnyRate} = ${usdPerOz.toFixed(2)} USD/oz`);

    const rawData: SgePriceRaw = {
      price: ozPerCny,
      currency: 'CNY',
      unit: 'oz',
      source: 'Metals-API',
      timestamp: new Date(),
      symbol: 'XAG/CNY',
      rawResponse: response.data,
    };

    return {
      date,
      priceCnyPerGram: cnyPerGram,
      priceUsdPerOz: usdPerOz,
      source: 'Metals-API (XAG/CNY)',
      fxRateUsed: usdCnyRate,
      isEstimated: false,
      conversionSteps,
      rawData,
    };
  } catch (error) {
    console.error('[SGE Provider A] Metals-API error:', error instanceof Error ? error.message : error);
    return null;
  }
}

/**
 * Provider B: TwelveData API
 * Alternative provider for precious metals
 */
export async function fetchFromTwelveData(date: Date, usdCnyRate: number): Promise<SgePriceNormalized | null> {
  const apiKey = process.env.TWELVE_DATA_API_KEY;
  if (!apiKey) {
    console.log('[SGE Provider B] TWELVE_DATA_API_KEY not configured');
    return null;
  }

  try {
    const conversionSteps: string[] = [];
    
    // TwelveData forex endpoint for XAG/USD
    const response = await axios.get('https://api.twelvedata.com/price', {
      params: {
        symbol: 'XAG/USD',
        apikey: apiKey,
      },
      timeout: 10000,
    });

    conversionSteps.push(`API Request: GET twelvedata.com/price?symbol=XAG/USD`);

    if (!response.data?.price) {
      console.log('[SGE Provider B] No price in response');
      return null;
    }

    const usdPerOz = parseFloat(response.data.price);
    conversionSteps.push(`Raw response: XAG/USD = ${usdPerOz} USD/oz`);
    
    const cnyPerOz = usdPerOz * usdCnyRate;
    conversionSteps.push(`Convert to CNY: ${usdPerOz} * ${usdCnyRate} = ${cnyPerOz.toFixed(2)} CNY/oz`);
    
    const cnyPerGram = cnyPerOz / OZ_TO_GRAMS;
    conversionSteps.push(`Convert to grams: ${cnyPerOz.toFixed(2)} / ${OZ_TO_GRAMS} = ${cnyPerGram.toFixed(4)} CNY/g`);

    const rawData: SgePriceRaw = {
      price: usdPerOz,
      currency: 'USD',
      unit: 'oz',
      source: 'TwelveData',
      timestamp: new Date(),
      symbol: 'XAG/USD',
      rawResponse: response.data,
    };

    return {
      date,
      priceCnyPerGram: cnyPerGram,
      priceUsdPerOz: usdPerOz,
      source: 'TwelveData (XAG/USD)',
      fxRateUsed: usdCnyRate,
      isEstimated: false,
      conversionSteps,
      rawData,
    };
  } catch (error) {
    console.error('[SGE Provider B] TwelveData error:', error instanceof Error ? error.message : error);
    return null;
  }
}

/**
 * Provider C: Manual/Environment Variable
 * For manual overrides or when APIs are down
 */
export async function fetchFromManual(date: Date, usdCnyRate: number): Promise<SgePriceNormalized | null> {
  const manualPrice = process.env.SGE_MANUAL_PRICE_CNY_G;
  if (!manualPrice) {
    console.log('[SGE Provider C] SGE_MANUAL_PRICE_CNY_G not configured');
    return null;
  }

  const conversionSteps: string[] = [];
  
  const priceCnyPerGram = parseFloat(manualPrice);
  if (isNaN(priceCnyPerGram)) {
    console.error('[SGE Provider C] Invalid manual price format');
    return null;
  }

  conversionSteps.push(`Manual price from ENV: ${priceCnyPerGram} CNY/g`);
  
  const priceUsdPerOz = (priceCnyPerGram * OZ_TO_GRAMS) / usdCnyRate;
  conversionSteps.push(`Convert to USD/oz: (${priceCnyPerGram} * ${OZ_TO_GRAMS}) / ${usdCnyRate} = ${priceUsdPerOz.toFixed(2)} USD/oz`);

  const rawData: SgePriceRaw = {
    price: priceCnyPerGram,
    currency: 'CNY',
    unit: 'g',
    source: 'Manual ENV',
    timestamp: new Date(),
  };

  return {
    date,
    priceCnyPerGram,
    priceUsdPerOz,
    source: 'Manual (ENV)',
    fxRateUsed: usdCnyRate,
    isEstimated: true,
    conversionSteps,
    rawData,
  };
}

/**
 * Provider D: COMEX + Shanghai Premium (Fallback Estimation)
 */
export async function fetchFromComexPlusPremium(
  date: Date,
  usdCnyRate: number,
  comexPriceUsd: number | null
): Promise<SgePriceNormalized | null> {
  if (!comexPriceUsd) {
    console.log('[SGE Provider D] COMEX price not available for estimation');
    return null;
  }

  const conversionSteps: string[] = [];
  
  // Typical Shanghai premium: 2-5% over COMEX
  const premiumPercent = parseFloat(process.env.SGE_PREMIUM_PERCENT || '3');
  conversionSteps.push(`Using COMEX price: ${comexPriceUsd} USD/oz`);
  conversionSteps.push(`Applying Shanghai premium: ${premiumPercent}%`);
  
  const priceUsdPerOz = comexPriceUsd * (1 + premiumPercent / 100);
  conversionSteps.push(`SGE estimated: ${comexPriceUsd} * ${1 + premiumPercent / 100} = ${priceUsdPerOz.toFixed(2)} USD/oz`);
  
  const cnyPerOz = priceUsdPerOz * usdCnyRate;
  const priceCnyPerGram = cnyPerOz / OZ_TO_GRAMS;
  conversionSteps.push(`Convert to CNY/g: (${priceUsdPerOz} * ${usdCnyRate}) / ${OZ_TO_GRAMS} = ${priceCnyPerGram.toFixed(4)} CNY/g`);

  const rawData: SgePriceRaw = {
    price: comexPriceUsd,
    currency: 'USD',
    unit: 'oz',
    source: 'COMEX + Premium Estimate',
    timestamp: new Date(),
  };

  return {
    date,
    priceCnyPerGram,
    priceUsdPerOz,
    source: `COMEX + ${premiumPercent}% Premium`,
    fxRateUsed: usdCnyRate,
    isEstimated: true,
    conversionSteps,
    rawData,
  };
}

/**
 * Plausibility check for silver prices
 */
export function validateSilverPrice(priceUsdPerOz: number): {
  isValid: boolean;
  errors: string[];
  warnings: string[];
} {
  const errors: string[] = [];
  const warnings: string[] = [];
  
  // Realistic silver price range (configurable via ENV)
  const minPrice = parseFloat(process.env.SILVER_MIN_PRICE || '10');
  const maxPrice = parseFloat(process.env.SILVER_MAX_PRICE || '200');
  
  if (priceUsdPerOz < minPrice) {
    errors.push(`Price ${priceUsdPerOz} USD/oz below minimum ${minPrice} - possible unit error (g instead of oz?)`);
  }
  
  if (priceUsdPerOz > maxPrice) {
    errors.push(`Price ${priceUsdPerOz} USD/oz above maximum ${maxPrice} - possible gold instead of silver?`);
  }
  
  // Warn if price seems unusual
  if (priceUsdPerOz < 15 || priceUsdPerOz > 150) {
    warnings.push(`Price ${priceUsdPerOz} USD/oz is outside typical range (15-150)`);
  }
  
  return {
    isValid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Main provider orchestration with fallback logic
 */
export async function fetchSgePriceWithProviders(
  date: Date,
  usdCnyRate: number,
  comexPriceUsd?: number | null
): Promise<SgePriceNormalized | null> {
  const providers = [
    { name: 'Provider A (Metals-API)', fn: () => fetchFromMetalsAPI(date, usdCnyRate) },
    { name: 'Provider B (TwelveData)', fn: () => fetchFromTwelveData(date, usdCnyRate) },
    { name: 'Provider C (Manual ENV)', fn: () => fetchFromManual(date, usdCnyRate) },
    { name: 'Provider D (COMEX + Premium)', fn: () => fetchFromComexPlusPremium(date, usdCnyRate, comexPriceUsd || null) },
  ];

  for (const provider of providers) {
    console.log(`[SGE] Trying ${provider.name}...`);
    try {
      const result = await provider.fn();
      if (result) {
        // Validate the price
        const validation = validateSilverPrice(result.priceUsdPerOz);
        
        if (!validation.isValid) {
          console.error(`[SGE] ${provider.name} validation failed:`, validation.errors);
          continue;
        }
        
        if (validation.warnings.length > 0) {
          console.warn(`[SGE] ${provider.name} warnings:`, validation.warnings);
        }
        
        console.log(`[SGE] ✓ ${provider.name} success: ${result.priceUsdPerOz.toFixed(2)} USD/oz`);
        return result;
      }
    } catch (error) {
      console.error(`[SGE] ${provider.name} error:`, error);
    }
  }

  console.error('[SGE] All providers failed');
  return null;
}
