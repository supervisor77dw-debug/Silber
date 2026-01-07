/**
 * Retail Provider Configuration
 * 
 * Defines base URLs and discovery strategies for retail silver dealers
 * Each provider has fallback mechanisms for URL discovery
 */

export interface ProductMatcher {
  keywords: string[]; // e.g., ["maple leaf", "1 oz", "silber"]
  exactName?: string; // Exact product name if known
  fineOz: number;
}

export type DiscoveryStrategy = 
  | 'direct-url'      // URL is stable, use as-is
  | 'site-search'     // Use provider's search function
  | 'category-browse' // Browse category and find product
  | 'sitemap'         // Parse sitemap.xml
  | 'api';            // Use provider's API

export interface RetailProviderConfig {
  name: string;
  displayName: string;
  baseUrl: string;
  products: Array<{
    product: string;
    directUrl: string | null; // Try this first
    matcher: ProductMatcher;
    discoveryStrategy: DiscoveryStrategy[];
    searchPath?: string; // e.g., "/search?q={query}"
    categoryPath?: string; // e.g., "/silbermuenzen"
  }>;
  selectors: {
    // CSS selectors for price extraction (try in order)
    price: string[];
    productName?: string[];
    availability?: string[];
  };
  headers?: Record<string, string>; // Custom request headers
}

/**
 * PRODUCTION PROVIDER CONFIGS
 * 
 * CRITICAL: Use category-based discovery, NO hardcoded product URLs
 */
export const RETAIL_PROVIDERS: RetailProviderConfig[] = [
  {
    name: 'proaurum',
    displayName: 'Pro Aurum',
    baseUrl: 'https://www.proaurum.de',
    products: [
      {
        product: '1oz Philharmoniker',
        directUrl: null, // No hardcoded URL - use discovery
        matcher: {
          keywords: ['philharmoniker', '1 oz', 'silber', 'österreich'],
          exactName: 'Philharmoniker 1 oz Silber',
          fineOz: 1.0,
        },
        discoveryStrategy: ['category-browse', 'site-search'],
        searchPath: '/search?q=philharmoniker+1+oz+silber',
        categoryPath: '/shop/silber/', // Base category from user requirement
      },
    ],
    selectors: {
      price: [
        'meta[property="product:price:amount"]', // Open Graph
        '[itemprop="price"]', // Schema.org
        '.product-price .price-value',
        '.price-final_price .price',
        '[data-price-amount]',
        '.price-box .price',
      ],
    },
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'de-DE,de;q=0.9,en;q=0.8',
    },
  },
  {
    name: 'degussa',
    displayName: 'Degussa Goldhandel',
    baseUrl: 'https://www.degussa-goldhandel.de',
    products: [
      {
        product: '1oz Maple Leaf',
        directUrl: null, // No hardcoded URL - use discovery
        matcher: {
          keywords: ['maple leaf', '1 oz', 'silber', 'kanada'],
          exactName: 'Maple Leaf 1 oz Silber',
          fineOz: 1.0,
        },
        discoveryStrategy: ['category-browse', 'site-search'],
        searchPath: '/search?q=maple+leaf+1+oz',
        categoryPath: '/silber/silbermuenzen/', // From user requirement
      },
    ],
    selectors: {
      price: [
        'meta[property="product:price:amount"]',
        '[itemprop="price"]',
        '.product-detail-price .price-value',
        '.price-final_price .price',
        '.product-price-value',
        '[data-price]',
      ],
    },
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'de-DE,de;q=0.9,en;q=0.8',
    },
  },
];

/**
 * Get provider config by name
 */
export function getProviderConfig(name: string): RetailProviderConfig | undefined {
  return RETAIL_PROVIDERS.find(p => p.name === name);
}

/**
 * Get all active providers
 */
export function getActiveProviders(): RetailProviderConfig[] {
  return RETAIL_PROVIDERS;
}
