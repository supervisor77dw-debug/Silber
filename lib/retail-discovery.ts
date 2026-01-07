/**
 * Retail URL Discovery Service
 * 
 * Handles robust URL discovery with fallback strategies
 * Never fails hard - always returns result with status
 */

import * as cheerio from 'cheerio';
import type { RetailProviderConfig } from './retail-provider-config';

export interface DiscoveryResult {
  success: boolean;
  url: string | null;
  strategy: string; // Which strategy succeeded
  errorMessage?: string;
  httpStatus?: number;
  attemptedUrls: string[]; // For debugging
}

/**
 * Discover product URL using multiple strategies with fallbacks
 */
export async function discoverProductUrl(
  provider: RetailProviderConfig,
  productConfig: RetailProviderConfig['products'][0]
): Promise<DiscoveryResult> {
  const attemptedUrls: string[] = [];
  
  // Try strategies in order
  for (const strategy of productConfig.discoveryStrategy) {
    try {
      switch (strategy) {
        case 'direct-url':
          if (productConfig.directUrl) {
            const url = provider.baseUrl + productConfig.directUrl;
            attemptedUrls.push(url);
            
            const isValid = await validateUrl(url, provider, productConfig);
            if (isValid) {
              return {
                success: true,
                url,
                strategy: 'direct-url',
                attemptedUrls,
              };
            }
          }
          break;
          
        case 'site-search':
          if (productConfig.searchPath) {
            const searchUrl = provider.baseUrl + productConfig.searchPath;
            attemptedUrls.push(searchUrl);
            
            const foundUrl = await searchForProduct(searchUrl, provider, productConfig);
            if (foundUrl) {
              return {
                success: true,
                url: foundUrl,
                strategy: 'site-search',
                attemptedUrls,
              };
            }
          }
          break;
          
        case 'category-browse':
          if (productConfig.categoryPath) {
            const categoryUrl = provider.baseUrl + productConfig.categoryPath;
            attemptedUrls.push(categoryUrl);
            
            const foundUrl = await browseCategory(categoryUrl, provider, productConfig);
            if (foundUrl) {
              return {
                success: true,
                url: foundUrl,
                strategy: 'category-browse',
                attemptedUrls,
              };
            }
          }
          break;
      }
    } catch (error) {
      console.warn(`[Discovery] Strategy ${strategy} failed:`, error);
      // Continue to next strategy
    }
  }
  
  // All strategies failed
  return {
    success: false,
    url: null,
    strategy: 'none',
    errorMessage: 'All discovery strategies failed',
    attemptedUrls,
  };
}

/**
 * Validate that URL exists and contains expected product
 */
async function validateUrl(
  url: string,
  provider: RetailProviderConfig,
  productConfig: RetailProviderConfig['products'][0]
): Promise<boolean> {
  try {
    const response = await fetch(url, {
      method: 'HEAD', // HEAD request is faster
      headers: provider.headers || {},
      signal: AbortSignal.timeout(5000), // 5s timeout
    });
    
    // 200 OK = URL exists
    if (response.ok) {
      return true;
    }
    
    // 404/410 = URL doesn't exist
    if (response.status === 404 || response.status === 410) {
      return false;
    }
    
    // Other errors (403, 500, etc.) = might be temporary, try GET
    const fullResponse = await fetch(url, {
      headers: provider.headers || {},
      signal: AbortSignal.timeout(10000),
    });
    
    if (!fullResponse.ok) {
      return false;
    }
    
    // Optional: Verify page contains product keywords
    const html = await fullResponse.text();
    const $ = cheerio.load(html);
    const pageText = $('body').text().toLowerCase();
    
    // Check if at least 2 keywords match
    const keywordMatches = productConfig.matcher.keywords.filter(
      keyword => pageText.includes(keyword.toLowerCase())
    );
    
    return keywordMatches.length >= 2;
    
  } catch (error) {
    console.warn(`[Validate] URL ${url} failed:`, error);
    return false;
  }
}

/**
 * Search provider's site for product URL
 */
async function searchForProduct(
  searchUrl: string,
  provider: RetailProviderConfig,
  productConfig: RetailProviderConfig['products'][0]
): Promise<string | null> {
  try {
    const response = await fetch(searchUrl, {
      headers: provider.headers || {},
      signal: AbortSignal.timeout(10000),
    });
    
    if (!response.ok) {
      return null;
    }
    
    const html = await response.text();
    const $ = cheerio.load(html);
    
    // Find product links in search results
    const productLinks: string[] = [];
    
    // Common selectors for product links in search results
    const linkSelectors = [
      '.product-item a[href]',
      '.search-result-item a[href]',
      'a.product-link[href]',
      'article.product a[href]',
      '.product-list-item a[href]',
    ];
    
    for (const selector of linkSelectors) {
      $(selector).each((_, elem) => {
        const href = $(elem).attr('href');
        const text = $(elem).text().toLowerCase();
        
        if (!href) return;
        
        // Check if link text matches product keywords
        const keywordMatches = productConfig.matcher.keywords.filter(
          keyword => text.includes(keyword.toLowerCase())
        );
        
        if (keywordMatches.length >= 2) {
          // Make absolute URL
          const absoluteUrl = href.startsWith('http') 
            ? href 
            : provider.baseUrl + (href.startsWith('/') ? href : '/' + href);
          productLinks.push(absoluteUrl);
        }
      });
      
      if (productLinks.length > 0) break;
    }
    
    // Return first matching link
    return productLinks[0] || null;
    
  } catch (error) {
    console.warn(`[Search] Failed at ${searchUrl}:`, error);
    return null;
  }
}

/**
 * Browse category page and find product
 */
async function browseCategory(
  categoryUrl: string,
  provider: RetailProviderConfig,
  productConfig: RetailProviderConfig['products'][0]
): Promise<string | null> {
  // Similar logic to searchForProduct
  // Browse category listing and match product by keywords
  return searchForProduct(categoryUrl, provider, productConfig);
}

/**
 * Extract price from HTML using configured selectors
 */
export function extractPriceFromHtml(
  html: string,
  selectors: string[]
): { price: number | null; rawExcerpt: string } {
  const $ = cheerio.load(html);
  
  for (const selector of selectors) {
    try {
      // Check if selector is for meta tag
      if (selector.startsWith('meta[')) {
        const content = $(selector).attr('content');
        if (content) {
          const price = parseFloat(content);
          if (!isNaN(price) && price > 0) {
            return {
              price,
              rawExcerpt: `<${selector} content="${content}">`,
            };
          }
        }
      }
      // Check for attribute selector like [data-price]
      else if (selector.includes('[') && selector.includes(']')) {
        const elem = $(selector).first();
        if (elem.length) {
          // Try data attribute
          const attrMatch = selector.match(/\[([\w-]+)\]/);
          if (attrMatch) {
            const attrValue = elem.attr(attrMatch[1]);
            if (attrValue) {
              const price = parseFloat(attrValue);
              if (!isNaN(price) && price > 0) {
                return {
                  price,
                  rawExcerpt: `${selector}: ${elem.html()?.substring(0, 500) || ''}`,
                };
              }
            }
          }
          
          // Try text content
          const text = elem.text().trim();
          const match = text.match(/(\d+[.,]\d+)/);
          if (match) {
            const price = parseFloat(match[1].replace(',', '.'));
            if (!isNaN(price) && price > 0) {
              return {
                price,
                rawExcerpt: `${selector}: ${text}`,
              };
            }
          }
        }
      }
      // Regular CSS selector
      else {
        const elem = $(selector).first();
        if (elem.length) {
          const text = elem.text().trim();
          // Extract number from "35,80 €" or "35.80" or "35.80 EUR"
          const match = text.match(/(\d+[.,]\d+)/);
          if (match) {
            const price = parseFloat(match[1].replace(',', '.'));
            if (!isNaN(price) && price > 0) {
              return {
                price,
                rawExcerpt: `${selector}: ${text}`,
              };
            }
          }
        }
      }
    } catch (error) {
      // Selector failed, try next
      continue;
    }
  }
  
  // Also try JSON-LD structured data
  try {
    let jsonLdResult: { price: number; rawExcerpt: string } | null = null;
    
    $('script[type="application/ld+json"]').each((_, elem) => {
      if (jsonLdResult) return false; // Stop if already found
      
      const jsonText = $(elem).html();
      if (!jsonText) return;
      
      try {
        const jsonData = JSON.parse(jsonText);
        
        // Handle array of JSON-LD objects
        const items = Array.isArray(jsonData) ? jsonData : [jsonData];
        
        for (const item of items) {
          if (item['@type'] === 'Product' && item.offers) {
            const offers = Array.isArray(item.offers) ? item.offers[0] : item.offers;
            if (offers.price) {
              const price = parseFloat(offers.price);
              if (!isNaN(price) && price > 0) {
                jsonLdResult = {
                  price,
                  rawExcerpt: `JSON-LD: ${JSON.stringify(offers).substring(0, 500)}`,
                };
                return false; // Stop iteration
              }
            }
          }
        }
      } catch {
        // Invalid JSON, skip
      }
    });
    
    if (jsonLdResult) return jsonLdResult;
  } catch {
    // JSON-LD parsing failed
  }
  
  return { price: null, rawExcerpt: '' };
}
