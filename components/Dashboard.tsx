'use client';

import { useEffect, useState } from 'react';
import MetricCard from './MetricCard';
import SpreadChart from './SpreadChart';
import StockChart from './StockChart';
import PriceChart from './PriceChart';
import DataQuality from './DataQuality';
import { format } from 'date-fns';

interface DashboardData {
  currentSpread: any;
  currentStock: any;
  lastFetch: any;
  trends: {
    spread: 'up' | 'down' | 'stable';
    registered: 'up' | 'down' | 'stable';
  };
  weekData: any[];
}

export default function Dashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [timeRange, setTimeRange] = useState(30);

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    try {
      const response = await fetch('/api/dashboard');
      const result = await response.json();
      setData(result);
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-xl">Laden...</div>
      </div>
    );
  }

  if (!data || !data.currentSpread) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <h2 className="text-2xl font-bold mb-4">Keine Daten verfügbar</h2>
          <p className="text-gray-600 dark:text-gray-400 mb-4">
            Bitte führen Sie den ersten Datenabruf durch.
          </p>
          <button
            onClick={() => fetch('/api/cron/fetch-data', { method: 'POST' })}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            Daten jetzt abrufen
          </button>
        </div>
      </div>
    );
  }

  const { currentSpread, currentStock, lastFetch, trends } = data;

  return (
    <div className="container mx-auto px-4 py-8 max-w-7xl">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-4xl font-bold mb-2 text-gray-900 dark:text-white">
          Silver Market Analysis
        </h1>
        <p className="text-gray-600 dark:text-gray-400">
          COMEX vs SGE Spread-Tracker
        </p>
        <p className="text-sm text-gray-500 dark:text-gray-500 mt-2">
          Letzte Aktualisierung: {lastFetch ? format(new Date(lastFetch.fetchedAt), 'dd.MM.yyyy HH:mm') : 'N/A'}
        </p>
      </div>

      {/* Data Quality */}
      <DataQuality lastFetch={lastFetch} />

      {/* Metrics Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <MetricCard
          title="Registered"
          value={currentSpread.registered.toLocaleString('de-DE', { maximumFractionDigits: 0 })}
          unit="oz"
          trend={trends.registered}
          subtitle={`${currentSpread.registeredPercent.toFixed(2)}% of Total`}
        />
        <MetricCard
          title="Eligible"
          value={currentSpread.eligible.toLocaleString('de-DE', { maximumFractionDigits: 0 })}
          unit="oz"
        />
        <MetricCard
          title="Spread"
          value={currentSpread.spreadUsdPerOz.toFixed(2)}
          unit="USD/oz"
          trend={trends.spread}
          subtitle={`${currentSpread.spreadPercent.toFixed(2)}%`}
          highlight={currentSpread.isExtreme}
        />
        <MetricCard
          title="SGE Price"
          value={currentSpread.sgeUsdPerOz.toFixed(2)}
          unit="USD/oz"
          subtitle={`COMEX: $${currentSpread.comexUsdPerOz.toFixed(2)}`}
        />
      </div>

      {/* Time Range Selector */}
      <div className="mb-4 flex gap-2">
        {[7, 30, 90, 365].map((days) => (
          <button
            key={days}
            onClick={() => setTimeRange(days)}
            className={`px-4 py-2 rounded ${
              timeRange === days
                ? 'bg-blue-600 text-white'
                : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
            }`}
          >
            {days}d
          </button>
        ))}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        <StockChart days={timeRange} />
        <PriceChart days={timeRange} />
      </div>

      <div className="mb-8">
        <SpreadChart days={timeRange} />
      </div>

      {/* Export Button */}
      <div className="flex justify-end">
        <a
          href={`/api/export?days=${timeRange}`}
          download
          className="px-6 py-3 bg-green-600 text-white rounded hover:bg-green-700"
        >
          Export CSV
        </a>
      </div>

      {/* Warehouse Details */}
      {currentStock?.warehouses && currentStock.warehouses.length > 0 && (
        <div className="mt-8">
          <h2 className="text-2xl font-bold mb-4 text-gray-900 dark:text-white">
            Warehouse Details
          </h2>
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
              <thead className="bg-gray-50 dark:bg-gray-900">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Warehouse
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Registered
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Eligible
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Total
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                {currentStock.warehouses.map((wh: any) => (
                  <tr key={wh.id}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white">
                      {wh.warehouseName}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-right text-gray-900 dark:text-white">
                      {wh.registered.toLocaleString('de-DE', { maximumFractionDigits: 0 })}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-right text-gray-900 dark:text-white">
                      {wh.eligible.toLocaleString('de-DE', { maximumFractionDigits: 0 })}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-right font-medium text-gray-900 dark:text-white">
                      {(wh.registered + wh.eligible).toLocaleString('de-DE', { maximumFractionDigits: 0 })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="mt-12 pt-6 border-t border-gray-200 dark:border-gray-700 text-sm text-gray-600 dark:text-gray-400">
        <p>
          Datenquellen:{' '}
          <a href="https://www.cmegroup.com/delivery_reports/Silver_stocks.xls" target="_blank" className="text-blue-600 dark:text-blue-400 hover:underline">
            CME Group
          </a>
          {' | '}
          <a href="https://www.sge.com.cn" target="_blank" className="text-blue-600 dark:text-blue-400 hover:underline">
            Shanghai Gold Exchange
          </a>
        </p>
        <p className="mt-2">
          Hinweis: Registered ≠ Total physical accessible. Diese App dient nur zu Informationszwecken.
        </p>
      </footer>
    </div>
  );
}
