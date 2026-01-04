'use client';

import { useEffect, useState } from 'react';
import MetricCard from './MetricCard';
import SpreadChart from './SpreadChart';
import StockChart from './StockChart';
import PriceChart from './PriceChart';
import DataQuality from './DataQuality';
import { ToastNotification, useToast } from './ToastNotification';
import { format } from 'date-fns';
import { ArrowPathIcon } from '@heroicons/react/24/outline';

interface DashboardData {
  currentSpread: any;
  currentStock: any;
  lastFetch: any;
  trends: {
    spread: 'up' | 'down' | 'stable';
    registered: 'up' | 'down' | 'stable';
  };
  weekData: any[];
  dataStatus?: 'current' | 'yesterday' | 'stale';
  dataDate?: string;
  daysSinceUpdate?: number;
}

export default function Dashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [timeRange, setTimeRange] = useState(30);
  const [refreshing, setRefreshing] = useState(false);
  const toast = useToast();

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    try {
      // DB-First: Lade immer aus der Datenbank
      const response = await fetch('/api/dashboard-v2');
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const message = errorData.details || errorData.error || `HTTP ${response.status}: ${response.statusText}`;
        throw new Error(message);
      }
      
      const result = await response.json();
      setData(result);
      setError(null);
      
      // Info-Toast bei veralteten Daten
      if (result.dataStatus === 'stale' && result.daysSinceUpdate) {
        toast.warning(
          `Daten sind ${result.daysSinceUpdate} Tage alt`,
          'Klicken Sie auf "Aktualisieren" um neue Daten abzurufen'
        );
      }
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
      setError(error instanceof Error ? error.message : 'Unbekannter Fehler');
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    
    try {
      const cronSecret = process.env.NEXT_PUBLIC_CRON_SECRET || '';
      const response = await fetch('/api/refresh', { 
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${cronSecret}`,
        },
      });
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      
      const result = await response.json();
      
      // Status anzeigen
      const { updated, skipped, sourceStatus } = result;
      
      if (updated.length > 0 && skipped.length === 0) {
        toast.success(
          'Alle Datenquellen erfolgreich aktualisiert',
          `${updated.length} Quellen live abgerufen`
        );
      } else if (updated.length > 0) {
        toast.warning(
          `${updated.length} Quellen aktualisiert, ${skipped.length} nicht verfügbar`,
          'Nutze DB-Daten für fehlende Quellen'
        );
      } else {
        toast.info(
          'Live-Daten heute nicht verfügbar',
          'Zeige letzte gespeicherte DB-Werte'
        );
      }
      
      // WICHTIG: Dashboard aus DB neu laden
      await fetchDashboardData();
      
    } catch (error) {
      console.error('Refresh error:', error);
      toast.error(
        'Verbindungsfehler',
        'Konnte Server nicht erreichen'
      );
    } finally {
      setRefreshing(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-xl">Laden...</div>
      </div>
    );
  }

  if (error) {
    return (
      <>
        <ToastNotification toasts={toast.toasts} onDismiss={toast.dismissToast} />
        <div className="container mx-auto px-4 py-8 max-w-7xl">
          <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-6">
            <h2 className="text-lg font-semibold mb-2 text-yellow-900 dark:text-yellow-100">
              Verbindungsproblem
            </h2>
            <p className="text-sm text-yellow-800 dark:text-yellow-200 mb-4">
              Konnte keine Verbindung zur Datenbank herstellen.
            </p>
            <button
              onClick={fetchDashboardData}
              className="px-4 py-2 bg-yellow-600 text-white rounded hover:bg-yellow-700"
            >
              Erneut versuchen
            </button>
          </div>
        </div>
      </>
    );
  }

  if (!data || !data.currentSpread) {
    return (
      <>
        <ToastNotification toasts={toast.toasts} onDismiss={toast.dismissToast} />
        <div className="container mx-auto px-4 py-8 max-w-7xl">
          <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-6">
            <h2 className="text-lg font-semibold mb-2 text-blue-900 dark:text-blue-100">
              Keine Daten verfügbar
            </h2>
            <p className="text-sm text-blue-800 dark:text-blue-200 mb-4">
              Die Datenbank ist leer. Führen Sie einen Datenabruf durch.
            </p>
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
            >
              {refreshing ? 'Lädt...' : 'Daten abrufen'}
            </button>
          </div>
        </div>
      </>
    );
  }

  const { currentSpread, currentStock, lastFetch, trends, dataStatus, dataDate, daysSinceUpdate } = data;

  return (
    <>
      <ToastNotification toasts={toast.toasts} onDismiss={toast.dismissToast} />
      
      <div className="container mx-auto px-4 py-8 max-w-7xl">
        {/* Header */}
        <div className="mb-8 flex justify-between items-start">
          <div>
            <h1 className="text-4xl font-bold mb-2 text-gray-900 dark:text-white">
              Silver Market Analysis
            </h1>
            <p className="text-gray-600 dark:text-gray-400">
              COMEX vs SGE Spread-Tracker
            </p>
            <div className="flex items-center gap-2 mt-2">
              <p className="text-sm text-gray-500 dark:text-gray-500">
                Daten vom: {dataDate || (lastFetch ? format(new Date(lastFetch.fetchedAt), 'dd.MM.yyyy') : 'N/A')}
              </p>
              {dataStatus && (
                <span className={`px-2 py-1 text-xs rounded-full ${
                  dataStatus === 'current' 
                    ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300'
                    : dataStatus === 'yesterday'
                    ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300'
                    : 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300'
                }`}>
                  {dataStatus === 'current' ? '✓ Aktuell' : dataStatus === 'yesterday' ? '⚠ Gestern' : `⚠ ${daysSinceUpdate} Tage alt`}
                </span>
              )}
            </div>
          </div>
          
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <ArrowPathIcon className={`h-5 w-5 ${refreshing ? 'animate-spin' : ''}`} />
            <span>{refreshing ? 'Lädt...' : 'Aktualisieren'}</span>
          </button>
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
    </>
  );
}
