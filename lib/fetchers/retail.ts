/**
 * Retail Price Scrapers - PRODUCTION ONLY
 * 
 * Scrapers for Degussa and ProAurum silver retail prices
 * MUST provide: source_url, raw_excerpt, plausibility check
 * 
 * Runtime: Node (uses fetch, cheerio for HTML parsing)
 */

import * as cheerio from 'cheerio';

export interface RetailPriceResult {
  provider: string;
  product: string;
  priceEur: number;
  sourceUrl: string;
  rawExcerpt: string;
  verificationStatus: 'VERIFIED' | 'UNVERIFIED' | 'INVALID_PARSE' | 'FAILED';
  fineOz: number;
  errorMessage?: string;
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
 * Scrape ProAurum - 1oz Philharmoniker Silber
 * URL: https://www.proaurum.de/silbermuenzen/oesterreich/1-oz-philharmoniker-silbermuenze
 */
export async function scrapeProAurum(): Promise<RetailPriceResult> {
  const url = 'https://www.proaurum.de/silbermuenzen/oesterreich/1-oz-philharmoniker-silbermuenze';
  
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const html = await response.text();
    const $ = cheerio.load(html);
    
    // ProAurum typical selectors (may need adjustment based on actual HTML)
    // Look for price in meta tags, JSON-LD, or specific CSS classes
    let priceEur: number | null = null;
    let rawExcerpt = '';
    
    // Method 1: Try meta property="product:price:amount"
    const metaPrice = $('meta[property="product:price:amount"]').attr('content');
    if (metaPrice) {
      priceEur = parseFloat(metaPrice);
      rawExcerpt = `<meta property="product:price:amount" content="${metaPrice}">`;
    }
    
    // Method 2: Try schema.org JSON-LD
    if (!priceEur) {
      $('script[type="application/ld+json"]').each((_, elem) => {
        try {
          const jsonData = JSON.parse($(elem).html() || '{}');
          if (jsonData['@type'] === 'Product' && jsonData.offers?.price) {
            priceEur = parseFloat(jsonData.offers.price);
            rawExcerpt = JSON.stringify(jsonData.offers).substring(0, 2000);
          }
        } catch {
          // Skip invalid JSON
        }
      });
    }
    
    // Method 3: Try common CSS selectors
    if (!priceEur) {
      const priceSelectors = [
        '.product-price .price-value',
        '.price-final_price .price',
        '[data-price-amount]',
        '.price-box .price',
      ];
      
      for (const selector of priceSelectors) {
        const elem = $(selector).first();
        if (elem.length) {
          const text = elem.text().trim();
          // Extract number from "35,80 €" or "35.80"
          const match = text.match(/(\d+[.,]\d+)/);
          if (match) {
            priceEur = parseFloat(match[1].replace(',', '.'));
            rawExcerpt = `${selector}: ${elem.html()?.substring(0, 500)}`;
            break;
          }
        }
      }
    }
    
    if (!priceEur || isNaN(priceEur)) {
      throw new Error('Could not extract price from HTML');
    }
    
    return {
      provider: 'ProAurum',
      product: '1oz Philharmoniker',
      priceEur,
      sourceUrl: url,
      rawExcerpt: rawExcerpt.substring(0, 2000),
      verificationStatus: 'UNVERIFIED', // Will be validated against spot
      fineOz: 1.0,
    };
    
  } catch (error) {
    return {
      provider: 'ProAurum',
      product: '1oz Philharmoniker',
      priceEur: 0,
      sourceUrl: url,
      rawExcerpt: '',
      verificationStatus: 'FAILED',
      fineOz: 1.0,
      errorMessage: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Scrape Degussa - 1oz Maple Leaf Silber
 * URL: https://www.degussa-goldhandel.de/silbermuenzen/maple-leaf-1-oz.html
 */
export async function scrapeDegussa(): Promise<RetailPriceResult> {
  const url = 'https://www.degussa-goldhandel.de/silbermuenzen/maple-leaf-1-oz.html';
  
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const html = await response.text();
    const $ = cheerio.load(html);
    
    let priceEur: number | null = null;
    let rawExcerpt = '';
    
    // Method 1: Try meta tags
    const metaPrice = $('meta[property="product:price:amount"]').attr('content');
    if (metaPrice) {
      priceEur = parseFloat(metaPrice);
      rawExcerpt = `<meta property="product:price:amount" content="${metaPrice}">`;
    }
    
    // Method 2: Try JSON-LD
    if (!priceEur) {
      $('script[type="application/ld+json"]').each((_, elem) => {
        try {
          const jsonData = JSON.parse($(elem).html() || '{}');
          if (jsonData['@type'] === 'Product' && jsonData.offers?.price) {
            priceEur = parseFloat(jsonData.offers.price);
            rawExcerpt = JSON.stringify(jsonData.offers).substring(0, 2000);
          }
        } catch {
          // Skip invalid JSON
        }
      });
    }
    
    // Method 3: Try Degussa-specific selectors
    if (!priceEur) {
      const priceSelectors = [
        '.product-detail-price .price-value',
        '.price-final_price .price',
        '[itemprop="price"]',
        '.product-price-value',
      ];
      
      for (const selector of priceSelectors) {
        const elem = $(selector).first();
        if (elem.length) {
          const text = elem.text().trim();
          const match = text.match(/(\d+[.,]\d+)/);
          if (match) {
            priceEur = parseFloat(match[1].replace(',', '.'));
            rawExcerpt = `${selector}: ${elem.html()?.substring(0, 500)}`;
            break;
          }
        }
      }
    }
    
    if (!priceEur || isNaN(priceEur)) {
      throw new Error('Could not extract price from HTML');
    }
    
    return {
      provider: 'Degussa',
      product: '1oz Maple Leaf',
      priceEur,
      sourceUrl: url,
      rawExcerpt: rawExcerpt.substring(0, 2000),
      verificationStatus: 'UNVERIFIED', // Will be validated against spot
      fineOz: 1.0,
    };
    
  } catch (error) {
    return {
      provider: 'Degussa',
      product: '1oz Maple Leaf',
      priceEur: 0,
      sourceUrl: url,
      rawExcerpt: '',
      verificationStatus: 'FAILED',
      fineOz: 1.0,
      errorMessage: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Fetch all retail prices with plausibility checks
 */
export async function fetchRetailPrices(
  spotPriceUsd: number,
  usdEurRate: number
): Promise<RetailPriceResult[]> {
  const [proaurum, degussa] = await Promise.all([
    scrapeProAurum(),
    scrapeDegussa(),
  ]);
  
  // Apply plausibility checks
  const results = [proaurum, degussa];
  
  for (const result of results) {
    if (result.verificationStatus === 'FAILED') {
      continue; // Already marked as failed
    }
    
    const check = checkPlausibility(result.priceEur, spotPriceUsd, usdEurRate);
    
    if (!check.valid) {
      result.verificationStatus = 'INVALID_PARSE';
      result.errorMessage = check.reason;
    } else {
      result.verificationStatus = 'VERIFIED'; // Passed plausibility check
    }
  }
  
  return results;
}
