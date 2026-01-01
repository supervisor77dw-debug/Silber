interface MetricCardProps {
  title: string;
  value: string;
  unit?: string;
  trend?: 'up' | 'down' | 'stable';
  subtitle?: string;
  highlight?: boolean;
}

export default function MetricCard({ title, value, unit, trend, subtitle, highlight }: MetricCardProps) {
  const getTrendIcon = () => {
    if (!trend || trend === 'stable') return null;
    return trend === 'up' ? '↑' : '↓';
  };

  const getTrendColor = () => {
    if (!trend || trend === 'stable') return '';
    return trend === 'up' ? 'text-green-600' : 'text-red-600';
  };

  return (
    <div className={`bg-white dark:bg-gray-800 rounded-lg shadow p-6 ${highlight ? 'ring-2 ring-yellow-500' : ''}`}>
      <div className="flex justify-between items-start mb-2">
        <h3 className="text-sm font-medium text-gray-600 dark:text-gray-400">{title}</h3>
        {trend && (
          <span className={`text-xl ${getTrendColor()}`}>
            {getTrendIcon()}
          </span>
        )}
      </div>
      <div className="flex items-baseline">
        <p className="text-3xl font-bold text-gray-900 dark:text-white">{value}</p>
        {unit && <span className="ml-2 text-sm text-gray-600 dark:text-gray-400">{unit}</span>}
      </div>
      {subtitle && (
        <p className="mt-2 text-sm text-gray-500 dark:text-gray-500">{subtitle}</p>
      )}
      {highlight && (
        <p className="mt-2 text-xs text-yellow-600 dark:text-yellow-500 font-semibold">
          Extremwert erkannt
        </p>
      )}
    </div>
  );
}
