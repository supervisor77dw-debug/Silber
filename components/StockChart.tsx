'use client';

import { useEffect, useState } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { format } from 'date-fns';

interface StockChartProps {
  days: number;
}

export default function StockChart({ days }: StockChartProps) {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, [days]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/spreads?days=${days}`);
      const result = await response.json();
      
      const chartData = result.map((item: any) => ({
        date: format(new Date(item.date), 'dd.MM'),
        registered: item.registered,
        eligible: item.eligible,
        total: item.total,
      }));
      
      setData(chartData);
    } catch (error) {
      console.error('Error fetching stock data:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
        <h2 className="text-xl font-bold mb-4 text-gray-900 dark:text-white">COMEX Warehouse Stocks</h2>
        <div className="h-80 flex items-center justify-center">
          <p className="text-gray-500">Laden...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
      <h2 className="text-xl font-bold mb-4 text-gray-900 dark:text-white">COMEX Warehouse Stocks</h2>
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
            tickFormatter={(value) => `${(value / 1000000).toFixed(0)}M`}
          />
          <Tooltip 
            contentStyle={{ 
              backgroundColor: '#1F2937', 
              border: '1px solid #374151',
              borderRadius: '8px',
            }}
            labelStyle={{ color: '#F9FAFB' }}
            formatter={(value: any) => `${value.toLocaleString('de-DE', { maximumFractionDigits: 0 })} oz`}
          />
          <Legend />
          <Line 
            type="monotone" 
            dataKey="registered" 
            stroke="#EF4444" 
            name="Registered"
            strokeWidth={2}
            dot={false}
          />
          <Line 
            type="monotone" 
            dataKey="eligible" 
            stroke="#3B82F6" 
            name="Eligible"
            strokeWidth={2}
            dot={false}
          />
          <Line 
            type="monotone" 
            dataKey="total" 
            stroke="#10B981" 
            name="Total"
            strokeWidth={2}
            dot={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
