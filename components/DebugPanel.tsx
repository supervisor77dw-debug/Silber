'use client';

import { useState } from 'react';
import { ChevronDownIcon, ChevronUpIcon } from '@heroicons/react/24/outline';

interface DebugSnapshot {
  deployment: {
    env: string;
    commit: string;
    region: string;
    timestamp: string;
  };
  dbStats: {
    [key: string]: {
      count: number;
      minDate: string | null;
      maxDate: string | null;
      lastFetch: string | null;
    };
  };
  sourceHealth: {
    [key: string]: string;
  };
  lastRefresh: {
    timestamp: string;
    message: string;
    wrote: any;
  } | null;
  lastErrors: Array<{
    time: string;
    source: string;
    message: string;
    meta?: any;
  }>;
  lastWrites?: {
    metal_prices: Array<{
      date: string;
      price: number;
      source: string;
      fetchedAt: string;
    }>;
    retail_prices: Array<{
      date: string;
      provider: string;
      product: string;
      priceEur: number;
      verificationStatus: string;
      source: string;
      fetchedAt: string;
    }>;
  };
  timestamp: string;
}

interface DebugPanelProps {
  snapshot: DebugSnapshot | null;
  onRefresh: () => void;
  onBackfill?: () => void;
  refreshing?: boolean;
}

export default function DebugPanel({ 
  snapshot, 
  onRefresh, 
  onBackfill,
  refreshing = false,
}: DebugPanelProps) {
  const [expanded, setExpanded] = useState(true);

  if (!snapshot) {
    return (
      <div className="bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg p-4 mb-6">
        <div className="text-sm text-gray-600 dark:text-gray-400">
          Debug-Informationen werden geladen...
        </div>
      </div>
    );
  }

  const { deployment, dbStats, sourceHealth, lastRefresh, lastErrors } = snapshot;

  // Count total records
  const totalRecords = Object.values(dbStats).reduce((sum, stat) => sum + stat.count, 0);
  const isEmpty = totalRecords === 0;

  // Source status badges
  const getHealthBadge = (status: string) => {
    if (status === 'ok') {
      return <span className="px-2 py-0.5 text-xs bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300 rounded">✓ OK</span>;
    } else if (status === 'empty') {
      return <span className="px-2 py-0.5 text-xs bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-300 rounded">⚠ LEER</span>;
    } else {
      return <span className="px-2 py-0.5 text-xs bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300 rounded">✗ FAIL</span>;
    }
  };

  return (
    <div className="bg-blue-50 dark:bg-blue-950/30 border-2 border-blue-200 dark:border-blue-800 rounded-lg mb-6">
      {/* Header */}
      <div 
        className="flex items-center justify-between p-4 cursor-pointer"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold text-blue-900 dark:text-blue-100">
            🔍 Debug Console
          </h2>
          <span className="text-xs text-blue-700 dark:text-blue-300">
            {deployment.env} • {deployment.commit} • {deployment.region}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {isEmpty && (
            <span className="text-sm text-yellow-700 dark:text-yellow-300 font-medium">
              ⚠ DB LEER
            </span>
          )}
          <button
            onClick={(e) => {
              e.stopPropagation();
              setExpanded(!expanded);
            }}
            className="text-blue-700 dark:text-blue-300 hover:text-blue-900 dark:hover:text-blue-100"
          >
            {expanded ? <ChevronUpIcon className="w-5 h-5" /> : <ChevronDownIcon className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Expanded Content */}
      {expanded && (
        <div className="px-4 pb-4 space-y-4">
          {/* Action Buttons */}
          <div className="flex gap-2">
            <button
              onClick={onRefresh}
              disabled={refreshing}
              className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {refreshing ? '⟳ Lädt...' : '▶ Start (Refresh)'}
            </button>
            {onBackfill && (
              <button
                onClick={onBackfill}
                disabled={refreshing}
                className="px-4 py-2 bg-purple-600 text-white text-sm font-medium rounded hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                📅 Backfill 30 Tage
              </button>
            )}
          </div>

          {/* DB Stats */}
          <div className="bg-white dark:bg-gray-900 rounded p-3">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-2">
              📊 DB Stats
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-xs">
              {Object.entries(dbStats).map(([table, stats]) => (
                <div key={table} className="border border-gray-200 dark:border-gray-700 rounded p-2">
                  <div className="font-medium text-gray-700 dark:text-gray-300">{table}</div>
                  <div className="text-gray-600 dark:text-gray-400">
                    Count: <span className="font-mono">{stats.count}</span>
                  </div>
                  {stats.minDate && stats.maxDate && (
                    <div className="text-gray-500 dark:text-gray-500 text-[10px] mt-1">
                      {stats.minDate} → {stats.maxDate}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Source Health */}
          <div className="bg-white dark:bg-gray-900 rounded p-3">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-2">
              🔌 Source Health
            </h3>
            <div className="flex flex-wrap gap-2">
              {Object.entries(sourceHealth).map(([source, status]) => (
                <div key={source} className="flex items-center gap-2">
                  <span className="text-xs text-gray-600 dark:text-gray-400">{source}:</span>
                  {getHealthBadge(status)}
                </div>
              ))}
            </div>
          </div>

          {/* Last Refresh */}
          {lastRefresh && (
            <div className="bg-white dark:bg-gray-900 rounded p-3">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-2">
                🔄 Last Refresh
              </h3>
              <div className="text-xs text-gray-700 dark:text-gray-300">
                <div><strong>Time:</strong> {new Date(lastRefresh.timestamp).toLocaleString('de-DE')}</div>
                <div><strong>Message:</strong> {lastRefresh.message}</div>
                {lastRefresh.wrote && Object.keys(lastRefresh.wrote).length > 0 && (
                  <div className="mt-1">
                    <strong>Wrote:</strong> 
                    <pre className="mt-1 bg-gray-100 dark:bg-gray-800 p-2 rounded text-[10px] overflow-auto">
                      {JSON.stringify(lastRefresh.wrote, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Last Errors */}
          {lastErrors.length > 0 && (
            <div className="bg-white dark:bg-gray-900 rounded p-3">
              <h3 className="text-sm font-semibold text-red-900 dark:text-red-100 mb-2">
                ❌ Last Errors ({lastErrors.length})
              </h3>
              <div className="space-y-2 max-h-48 overflow-auto">
                {lastErrors.map((error, idx) => (
                  <div key={idx} className="text-xs border-l-2 border-red-500 pl-2 py-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-gray-500 dark:text-gray-500">
                        {new Date(error.time).toLocaleTimeString('de-DE')}
                      </span>
                      <span className="font-semibold text-red-700 dark:text-red-400">
                        {error.source}
                      </span>
                    </div>
                    <div className="text-red-800 dark:text-red-300 mt-1">
                      {error.message}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Last Writes - zeige was wirklich in DB geschrieben wurde */}
          {snapshot.lastWrites && (
            <div className="bg-white dark:bg-gray-900 rounded p-3">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-2">
                📝 Last Writes (letzte 5)
              </h3>
              
              {/* Metal Prices */}
              {snapshot.lastWrites.metal_prices.length > 0 && (
                <div className="mb-3">
                  <div className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Metal Prices:
                  </div>
                  <div className="space-y-1">
                    {snapshot.lastWrites.metal_prices.map((write, idx) => (
                      <div key={idx} className="text-xs text-gray-600 dark:text-gray-400 font-mono">
                        {write.date} • ${write.price.toFixed(2)} • {write.source}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Retail Prices */}
              {snapshot.lastWrites.retail_prices.length > 0 && (
                <div>
                  <div className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Retail Prices:
                  </div>
                  <div className="space-y-1">
                    {snapshot.lastWrites.retail_prices.map((write, idx) => (
                      <div key={idx} className="text-xs text-gray-600 dark:text-gray-400">
                        <span className="font-mono">{write.date}</span> • {write.provider} • {write.product} • €{write.priceEur.toFixed(2)}
                        {write.verificationStatus === 'UNVERIFIED' && (
                          <span className="ml-2 px-1 bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-300 rounded">
                            ⚠ UNVERIFIED
                          </span>
                        )}
                        <span className="ml-1 text-gray-500">({write.source})</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {snapshot.lastWrites.metal_prices.length === 0 && snapshot.lastWrites.retail_prices.length === 0 && (
                <div className="text-xs text-gray-500 dark:text-gray-500">
                  Keine Writes in DB gefunden
                </div>
              )}
            </div>
          )}

          {/* Timestamp */}
          <div className="text-xs text-gray-500 dark:text-gray-500 text-right">
            Snapshot: {new Date(snapshot.timestamp).toLocaleString('de-DE')}
          </div>
        </div>
      )}
    </div>
  );
}
