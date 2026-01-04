'use client';

import { useEffect, useState } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { format } from 'date-fns';

interface PriceChartProps {
  days: number;
}

export default function PriceChart({ days }: PriceChartProps) {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, [days]);

  const fetchData = async () => {
    setLoading(true);
    try {
      // Try metal_prices first (backfill data)
      const metalResponse = await fetch(`/api/metal-prices?days=${days}`, { cache: 'no-store' });
      if (metalResponse.ok) {
        const metalData = await metalResponse.json();
        if (metalData.prices && metalData.prices.length > 0) {
          const chartData = metalData.prices.map((item: any) => ({
            date: format(new Date(item.date), 'dd.MM'),
            silver: item.xagUsdClose,
            source: item.source,
          }));
          setData(chartData);
          setLoading(false);
          return;
        }
      }

      // Fallback to spreads API
      const response = await fetch(`/api/spreads?days=${days}`, { cache: 'no-store' });
      const result = await response.json();
      
      const chartData = result.map((item: any) => ({
        date: format(new Date(item.date), 'dd.MM'),
        sge: item.sgeUsdPerOz,
        comex: item.comexUsdPerOz,
      }));
      
      setData(chartData);
    } catch (error) {
      console.error('Error fetching price data:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
        <h2 className="text-xl font-bold mb-4 text-gray-900 dark:text-white">Price Comparison</h2>
        <div className="h-80 flex items-center justify-center">
          <p className="text-gray-500">Laden...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
      <h2 className="text-xl font-bold mb-4 text-gray-900 dark:text-white">Price Comparison</h2>
      <ResponsiveContainer width="100%" height={320}>
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
          <XAxis 
            dataKey="date" 
            stroke="#9CA3AF"
            style={{ fontSize: '12px' }}
          />
          <YAxis 
            stroke="#9CA3AF"
            style={{ fontSize: '12px' }}
            tickFormatter={(value) => `$${value.toFixed(0)}`}
          />
          <Tooltip 
            contentStyle={{ 
              backgroundColor: '#1F2937', 
              border: '1px solid #374151',
              borderRadius: '8px',
            }}
            labelStyle={{ color: '#F9FAFB' }}
            formatter={(value: any) => `$${value.toFixed(2)}/oz`}
          />
          <Legend />
          <Line 
            type="monotone" 
            dataKey="sge" 
            stroke="#F59E0B" 
            name="SGE Price"
            strokeWidth={2}
            dot={false}
          />
          <Line 
            type="monotone" 
            dataKey="comex" 
            stroke="#8B5CF6" 
            name="COMEX Price"
            strokeWidth={2}
            dot={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
