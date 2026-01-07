/**
 * Retail Price Scrapers - PRODUCTION ONLY
 * 
 * Scrapers for Degussa and ProAurum silver retail prices
 * MUST provide: source_url, raw_excerpt, plausibility check
 * 
 * Runtime: Node (uses fetch, cheerio for HTML parsing)
 * 
 * ARCHITECTURE V2: Uses robust URL discovery with fallbacks
 */

import { getActiveProviders } from '../retail-provider-config';
import { discoverProductUrl, extractPriceFromHtml } from '../retail-discovery';

export interface RetailPriceResult {
  provider: string;
  product: string;
  priceEur: number;
  sourceUrl: string;
  rawExcerpt: string;
  verificationStatus: 'VERIFIED' | 'UNVERIFIED' | 'INVALID_PARSE' | 'FAILED';
  fineOz: number;
  errorMessage?: string;
  discoveryStrategy?: string; // Which URL discovery method worked
  attemptedUrls?: string[]; // For debugging
}

/**
 * Plausibility check: Retail price must be >= spot * 0.95
 * (Retail can't be cheaper than spot - indicates parsing error)
 */
export function checkPlausibility(
  retailPriceEur: number,
  spotPriceUsd: number,
  usdEurRate: number
): { valid: boolean; reason?: string } {
  const spotEur = spotPriceUsd / usdEurRate; // Convert USD to EUR
  const minRetailEur = spotEur * 0.95; // 5% below spot = suspicious
  
  if (retailPriceEur < minRetailEur) {
    return {
      valid: false,
      reason: `Price ${retailPriceEur.toFixed(2)} EUR too low (spot: ${spotEur.toFixed(2)} EUR, min: ${minRetailEur.toFixed(2)} EUR)`,
    };
  }
  
  // Also check upper bound (20x spot = definitely wrong)
  const maxRetailEur = spotEur * 20;
  if (retailPriceEur > maxRetailEur) {
    return {
      valid: false,
      reason: `Price ${retailPriceEur.toFixed(2)} EUR too high (spot: ${spotEur.toFixed(2)} EUR, max: ${maxRetailEur.toFixed(2)} EUR)`,
    };
  }
  
  return { valid: true };
}

/**
 * Fetch all retail prices with plausibility checks
 * 
 * V2: Uses provider config + robust URL discovery
 */
export async function fetchRetailPrices(
  spotPriceUsd: number,
  usdEurRate: number
): Promise<RetailPriceResult[]> {
  const providers = getActiveProviders();
  const results: RetailPriceResult[] = [];
  
  for (const provider of providers) {
    for (const productConfig of provider.products) {
      try {
        // Step 1: Discover URL
        const discovery = await discoverProductUrl(provider, productConfig);
        
        if (!discovery.success || !discovery.url) {
          results.push({
            provider: provider.displayName,
            product: productConfig.product,
            priceEur: 0,
            sourceUrl: discovery.attemptedUrls[0] || provider.baseUrl,
            rawExcerpt: '',
            verificationStatus: 'FAILED',
            fineOz: productConfig.matcher.fineOz,
            errorMessage: `URL discovery failed: ${discovery.errorMessage}`,
            discoveryStrategy: discovery.strategy,
            attemptedUrls: discovery.attemptedUrls,
          });
          continue;
        }
        
        // Step 2: Fetch HTML
        const response = await fetch(discovery.url, {
          headers: provider.headers || {},
          signal: AbortSignal.timeout(10000),
        });
        
        if (!response.ok) {
          results.push({
            provider: provider.displayName,
            product: productConfig.product,
            priceEur: 0,
            sourceUrl: discovery.url,
            rawExcerpt: '',
            verificationStatus: 'FAILED',
            fineOz: productConfig.matcher.fineOz,
            errorMessage: `HTTP ${response.status}: ${response.statusText}`,
            discoveryStrategy: discovery.strategy,
            attemptedUrls: discovery.attemptedUrls,
          });
          continue;
        }
        
        const html = await response.text();
        
        // Step 3: Extract price
        const extraction = extractPriceFromHtml(html, provider.selectors.price);
        
        if (!extraction.price) {
          results.push({
            provider: provider.displayName,
            product: productConfig.product,
            priceEur: 0,
            sourceUrl: discovery.url,
            rawExcerpt: html.substring(0, 1000), // Save HTML snippet for debugging
            verificationStatus: 'FAILED',
            fineOz: productConfig.matcher.fineOz,
            errorMessage: 'Could not extract price from HTML',
            discoveryStrategy: discovery.strategy,
            attemptedUrls: discovery.attemptedUrls,
          });
          continue;
        }
        
        // Step 4: Plausibility check
        const check = checkPlausibility(extraction.price, spotPriceUsd, usdEurRate);
        
        results.push({
          provider: provider.displayName,
          product: productConfig.product,
          priceEur: extraction.price,
          sourceUrl: discovery.url,
          rawExcerpt: extraction.rawExcerpt.substring(0, 2000),
          verificationStatus: check.valid ? 'VERIFIED' : 'INVALID_PARSE',
          fineOz: productConfig.matcher.fineOz,
          errorMessage: check.valid ? undefined : check.reason,
          discoveryStrategy: discovery.strategy,
          attemptedUrls: discovery.attemptedUrls,
        });
        
      } catch (error) {
        results.push({
          provider: provider.displayName,
          product: productConfig.product,
          priceEur: 0,
          sourceUrl: provider.baseUrl + (productConfig.directUrl || ''),
          rawExcerpt: '',
          verificationStatus: 'FAILED',
          fineOz: productConfig.matcher.fineOz,
          errorMessage: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }
  
  return results;
}
