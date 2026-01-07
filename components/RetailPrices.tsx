'use client';

import { useEffect, useState } from 'react';

interface RetailPrice {
  date: string;
  provider: string;
  product: string;
  priceEur: number;
  priceUsd?: number | null;
  currency?: string;
  fxRate?: number | null;
  fineOz: number;
  impliedUsdOz: number | null;
  premiumPercent: number | null;
  fetchedAt: string;
  sourceUrl?: string | null;
  verificationStatus?: string;
  // Discovery tracking (CRITICAL for debugging)
  discoveryStrategy?: string | null;
  attemptedUrls?: string | null; // JSON array
  httpStatusCode?: number | null;
}

export default function RetailPrices() {
  const [prices, setPrices] = useState<RetailPrice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchRetailPrices();
  }, []);

  const fetchRetailPrices = async () => {
    try {
      const response = await fetch('/api/retail-prices', { cache: 'no-store' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      setPrices(data.prices || []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unbekannter Fehler');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
        <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white">
          Retail Prices (Händlerpreise)
        </h2>
        <p className="text-gray-500 dark:text-gray-400">Laden...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
        <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white">
          Retail Prices (Händlerpreise)
        </h2>
        <p className="text-red-600 dark:text-red-400">Fehler: {error}</p>
      </div>
    );
  }

  if (prices.length === 0) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
        <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white">
          Retail Prices (Händlerpreise)
        </h2>
        <p className="text-gray-500 dark:text-gray-400">
          Keine Retail-Preise verfügbar. Führen Sie einen Refresh durch.
        </p>
      </div>
    );
  }

  // CRITICAL: Filter out unverified prices - NEVER show them!
  const verifiedPrices = prices.filter(p => 
    p.verificationStatus === 'VERIFIED' && 
    p.sourceUrl
  );
  
  const invalidPrices = prices.filter(p => 
    p.verificationStatus === 'INVALID_PARSE'
  );
  
  const failedPrices = prices.filter(p => 
    p.verificationStatus === 'FAILED'
  );
  
  const unverifiedPrices = prices.filter(p => 
    p.verificationStatus === 'UNVERIFIED' ||
    !p.sourceUrl
  );

  // Group verified prices by provider
  const byProvider: Record<string, RetailPrice[]> = {};
  verifiedPrices.forEach(price => {
    if (!byProvider[price.provider]) {
      byProvider[price.provider] = [];
    }
    byProvider[price.provider].push(price);
  });

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
      <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white">
        🪙 Retail Prices (Händlerpreise)
      </h2>
      
      {/* WARNING: Show if NO verified prices */}
      {verifiedPrices.length === 0 && (
        <div className="mb-4 p-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
          <h3 className="font-semibold text-yellow-800 dark:text-yellow-300 mb-2">
            ⚠ Keine verifizierten Retail-Preise
          </h3>
          <p className="text-sm text-yellow-700 dark:text-yellow-400 mb-2">
            Es wurden keine Preise mit gültiger Quelle gefunden.
          </p>
          
          {invalidPrices.length > 0 && (
            <div className="mt-2 text-sm">
              <strong className="text-red-700 dark:text-red-400">
                {invalidPrices.length} ungültige Parse(s):
              </strong>
              <ul className="list-disc ml-5 mt-1">
                {invalidPrices.map((p, i) => (
                  <li key={i} className="text-gray-700 dark:text-gray-300">
                    {p.provider} - {p.product}: €{p.priceEur} (zu niedrig/hoch vs Spot)
                    {p.sourceUrl && (
                      <a 
                        href={p.sourceUrl} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="ml-2 text-blue-600 dark:text-blue-400 underline"
                      >
                        Quelle prüfen
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
          
          {failedPrices.length > 0 && (
            <div className="mt-2 text-sm">
              <strong className="text-red-700 dark:text-red-400">
                {failedPrices.length} Fetch-Fehler:
              </strong>
              <ul className="list-disc ml-5 mt-1 space-y-2">
                {failedPrices.map((p, i) => {
                  let attemptedUrls: string[] = [];
                  try {
                    if (p.attemptedUrls) {
                      attemptedUrls = JSON.parse(p.attemptedUrls);
                    }
                  } catch (e) {
                    // Invalid JSON
                  }
                  
                  return (
                    <li key={i} className="text-gray-700 dark:text-gray-300">
                      <div className="font-semibold">
                        {p.provider} - {p.product}
                      </div>
                      {p.httpStatusCode && (
                        <div className="text-xs text-red-600 dark:text-red-400">
                          HTTP {p.httpStatusCode}
                        </div>
                      )}
                      {p.discoveryStrategy && (
                        <div className="text-xs text-gray-500">
                          Strategy: {p.discoveryStrategy}
                        </div>
                      )}
                      {attemptedUrls.length > 0 && (
                        <div className="text-xs mt-1">
                          <div className="text-gray-500">Attempted URLs:</div>
                          {attemptedUrls.map((url, idx) => (
                            <div key={idx} className="ml-2 truncate">
                              <a 
                                href={url} 
                                target="_blank" 
                                rel="noopener noreferrer"
                                className="text-blue-600 dark:text-blue-400 hover:underline"
                              >
                                {url}
                              </a>
                            </div>
                          ))}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
          
          {unverifiedPrices.length > 0 && (
            <div className="mt-2 text-sm">
              <strong className="text-orange-700 dark:text-orange-400">
                {unverifiedPrices.length} ohne Quelle (nicht angezeigt):
              </strong>
              <ul className="list-disc ml-5 mt-1">
                {unverifiedPrices.map((p, i) => (
                  <li key={i} className="text-gray-700 dark:text-gray-300">
                    {p.provider} - {p.product}: €{p.priceEur} 
                    {!p.sourceUrl && <span className="text-red-600"> (source_url IS NULL)</span>}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
      
      {/* ONLY show verified prices with source */}
      {Object.keys(byProvider).length === 0 ? (
        <p className="text-gray-500 dark:text-gray-400">
          Keine verifizierten Preise. Scraper muss URLs + raw_excerpt liefern.
        </p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {Object.entries(byProvider).map(([provider, items]) => (
            <div key={provider} className="border border-gray-200 dark:border-gray-700 rounded-lg p-4">
              <h3 className="font-semibold text-lg mb-3 text-gray-900 dark:text-white">
                {provider} <span className="text-green-600 text-sm">✓ Verified</span>
              </h3>
              
              <div className="space-y-3">
                {items.map((item, idx) => (
                  <div 
                    key={idx}
                    className="border-l-4 border-green-500 bg-gray-50 dark:bg-gray-900/50 p-3 rounded"
                  >
                    <div className="flex justify-between items-start mb-2">
                      <span className="font-medium text-gray-900 dark:text-white">
                        {item.product}
                      </span>
                      <div className="text-right">
                        <span className="text-lg font-bold text-blue-600 dark:text-blue-400">
                          €{item.priceEur.toFixed(2)}
                        </span>
                        {item.priceUsd && (
                          <div className="text-xs text-gray-500">
                            ${item.priceUsd.toFixed(2)}
                          </div>
                        )}
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-2 text-sm text-gray-600 dark:text-gray-400">
                      <div>
                        <span className="text-gray-500">Fine Oz:</span>
                        <span className="ml-1 font-mono">{item.fineOz}</span>
                      </div>
                      
                      {item.impliedUsdOz && (
                        <div>
                          <span className="text-gray-500">USD/oz:</span>
                          <span className="ml-1 font-mono">${item.impliedUsdOz.toFixed(2)}</span>
                        </div>
                      )}
                      
                      {item.premiumPercent !== null && (
                        <div className="col-span-2">
                          <span className="text-gray-500">Premium:</span>
                          <span 
                            className={`ml-1 font-mono font-semibold ${
                              item.premiumPercent > 5 
                                ? 'text-red-600 dark:text-red-400' 
                                : item.premiumPercent > 2
                                ? 'text-yellow-600 dark:text-yellow-400'
                                : 'text-green-600 dark:text-green-400'
                            }`}
                          >
                            {item.premiumPercent > 0 ? '+' : ''}{item.premiumPercent.toFixed(2)}%
                          </span>
                        </div>
                      )}
                    </div>
                    
                    <div className="mt-2 flex justify-between items-center text-xs">
                      <span className="text-gray-400 dark:text-gray-600">
                        {new Date(item.fetchedAt).toLocaleString('de-DE')}
                      </span>
                      {item.sourceUrl && (
                        <a 
                          href={item.sourceUrl} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="text-blue-600 dark:text-blue-400 hover:underline"
                        >
                          🔗 Quelle prüfen
                        </a>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
