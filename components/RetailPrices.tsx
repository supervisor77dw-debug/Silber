'use client';

import { useEffect, useState } from 'react';

interface RetailPrice {
  date: string;
  provider: string;
  product: string;
  priceEur: number;
  fineOz: number;
  impliedUsdOz: number | null;
  premiumPercent: number | null;
  fetchedAt: string;
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

  // Group by provider
  const byProvider: Record<string, RetailPrice[]> = {};
  prices.forEach(price => {
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
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {Object.entries(byProvider).map(([provider, items]) => (
          <div key={provider} className="border border-gray-200 dark:border-gray-700 rounded-lg p-4">
            <h3 className="font-semibold text-lg mb-3 text-gray-900 dark:text-white">
              {provider}
            </h3>
            
            <div className="space-y-3">
              {items.map((item, idx) => (
                <div 
                  key={idx}
                  className="border-l-4 border-blue-500 bg-gray-50 dark:bg-gray-900/50 p-3 rounded"
                >
                  <div className="flex justify-between items-start mb-2">
                    <span className="font-medium text-gray-900 dark:text-white">
                      {item.product}
                    </span>
                    <span className="text-lg font-bold text-blue-600 dark:text-blue-400">
                      €{item.priceEur.toFixed(2)}
                    </span>
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
                  
                  <div className="mt-2 text-xs text-gray-400 dark:text-gray-600">
                    {new Date(item.fetchedAt).toLocaleString('de-DE')}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
