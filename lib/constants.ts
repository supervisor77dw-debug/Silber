// Constants for silver market calculations

// Troy ounce to grams conversion
export const OZ_TO_GRAMS = 31.1034768;

// Default thresholds
export const DEFAULT_THRESHOLDS = {
  SPREAD_USD: 2.0,
  REGISTERED_OZ: 50_000_000,
  WITHDRAWAL_OZ: 5_000_000,
} as const;

// Data sources
export const DATA_SOURCES = {
  COMEX_XLS: process.env.COMEX_XLS_URL || 'https://www.cmegroup.com/delivery_reports/Silver_stocks.xls',
  SGE_API: process.env.SGE_API_URL || '',
  FX_API: process.env.FX_API_URL || 'https://api.exchangerate.host/latest',
  ECB_FX: process.env.ECB_FX_URL || 'https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml',
} as const;

// Timezone
export const TIMEZONE = process.env.TZ || 'Europe/Berlin';

// Z-Score threshold for extreme values
export const EXTREME_ZSCORE_THRESHOLD = 2.5;

// Date format
export const DATE_FORMAT = 'yyyy-MM-dd';
