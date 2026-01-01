'use client';

import { useEffect, useState } from 'react';
import { ComposedChart, Line, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine } from 'recharts';
import { format } from 'date-fns';

interface SpreadChartProps {
  days: number;
}

export default function SpreadChart({ days }: SpreadChartProps) {
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
        spreadUsd: item.spreadUsdPerOz,
        spreadPercent: item.spreadPercent,
        isExtreme: item.isExtreme,
      }));
      
      setData(chartData);
    } catch (error) {
      console.error('Error fetching spread data:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
        <h2 className="text-xl font-bold mb-4 text-gray-900 dark:text-white">SGE - COMEX Spread</h2>
        <div className="h-96 flex items-center justify-center">
          <p className="text-gray-500">Laden...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
      <h2 className="text-xl font-bold mb-4 text-gray-900 dark:text-white">SGE - COMEX Spread</h2>
      <ResponsiveContainer width="100%" height={400}>
        <ComposedChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
          <XAxis 
            dataKey="date" 
            stroke="#9CA3AF"
            style={{ fontSize: '12px' }}
          />
          <YAxis 
            yAxisId="left"
            stroke="#9CA3AF"
            style={{ fontSize: '12px' }}
            tickFormatter={(value) => `$${value.toFixed(2)}`}
          />
          <YAxis 
            yAxisId="right"
            orientation="right"
            stroke="#9CA3AF"
            style={{ fontSize: '12px' }}
            tickFormatter={(value) => `${value.toFixed(1)}%`}
          />
          <Tooltip 
            contentStyle={{ 
              backgroundColor: '#1F2937', 
              border: '1px solid #374151',
              borderRadius: '8px',
            }}
            labelStyle={{ color: '#F9FAFB' }}
            formatter={(value: any, name: string) => {
              if (name === 'Spread USD') return `$${value.toFixed(2)}/oz`;
              if (name === 'Spread %') return `${value.toFixed(2)}%`;
              return value;
            }}
          />
          <Legend />
          <ReferenceLine yAxisId="left" y={0} stroke="#6B7280" strokeDasharray="3 3" />
          <Bar 
            yAxisId="left"
            dataKey="spreadUsd" 
            fill="#14B8A6" 
            name="Spread USD"
            opacity={0.8}
          />
          <Line 
            yAxisId="right"
            type="monotone" 
            dataKey="spreadPercent" 
            stroke="#F59E0B" 
            name="Spread %"
            strokeWidth={2}
            dot={(props: any) => {
              const { cx, cy, payload } = props;
              if (payload && payload.isExtreme) {
                return (
                  <circle cx={cx} cy={cy} r={6} fill="#EF4444" stroke="#FFF" strokeWidth={2} />
                );
              }
              return <circle cx={cx} cy={cy} r={0} />;
            }}
          />
        </ComposedChart>
      </ResponsiveContainer>
      <div className="mt-4 flex items-center gap-4 text-sm text-gray-600 dark:text-gray-400">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-red-500"></div>
          <span>Extremwert</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-8 h-3 bg-teal-500 opacity-80"></div>
          <span>Spread (USD)</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-8 h-0.5 bg-amber-500"></div>
          <span>Spread (%)</span>
        </div>
      </div>
    </div>
  );
}
