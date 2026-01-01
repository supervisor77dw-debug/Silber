import { prisma } from './db';
import { EXTREME_ZSCORE_THRESHOLD } from './constants';

/**
 * Calculates daily changes in COMEX stocks
 */
export async function calculateDailyChanges(date: Date, currentStock: {
  totalRegistered: number;
  totalEligible: number;
  totalCombined: number;
}) {
  // Get previous day's data
  const previousDay = new Date(date);
  previousDay.setDate(previousDay.getDate() - 1);
  
  const previousStock = await prisma.comexStock.findFirst({
    where: {
      date: {
        lte: previousDay,
      },
    },
    orderBy: {
      date: 'desc',
    },
  });
  
  if (!previousStock) {
    return {
      deltaRegistered: null,
      deltaEligible: null,
      deltaCombined: null,
    };
  }
  
  return {
    deltaRegistered: currentStock.totalRegistered - previousStock.totalRegistered,
    deltaEligible: currentStock.totalEligible - previousStock.totalEligible,
    deltaCombined: currentStock.totalCombined - previousStock.totalCombined,
  };
}

/**
 * Calculates spread between SGE and COMEX prices
 */
export function calculateSpread(sgeUsdPerOz: number, comexUsdPerOz: number) {
  const spreadUsdPerOz = sgeUsdPerOz - comexUsdPerOz;
  const spreadPercent = (spreadUsdPerOz / comexUsdPerOz) * 100;
  
  return {
    spreadUsdPerOz,
    spreadPercent,
  };
}

/**
 * Calculates z-score for anomaly detection
 */
export async function calculateZScore(value: number, metric: 'spread' | 'registered' | 'eligible'): Promise<number | null> {
  let field: 'spreadUsdPerOz' | 'registered' | 'eligible';
  
  if (metric === 'spread') {
    field = 'spreadUsdPerOz';
  } else if (metric === 'registered') {
    field = 'registered';
  } else {
    field = 'eligible';
  }
  
  // Get last 90 days of data
  const ninetyDaysAgo = new Date();
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
  
  const historicalData = await prisma.dailySpread.findMany({
    where: {
      date: {
        gte: ninetyDaysAgo,
      },
    },
    select: {
      [field]: true,
    },
  });
  
  if (historicalData.length < 10) {
    return null; // Not enough data
  }
  
  const values = historicalData.map(d => d[field] as number);
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / values.length;
  const stdDev = Math.sqrt(variance);
  
  if (stdDev === 0) {
    return null;
  }
  
  const zScore = (value - mean) / stdDev;
  return zScore;
}

/**
 * Checks if a value is extreme based on z-score
 */
export async function isExtremeValue(value: number, metric: 'spread' | 'registered' | 'eligible'): Promise<boolean> {
  const zScore = await calculateZScore(value, metric);
  
  if (zScore === null) {
    return false;
  }
  
  return Math.abs(zScore) > EXTREME_ZSCORE_THRESHOLD;
}

/**
 * Detects regime changes (e.g., 7 consecutive days of decline)
 */
export async function detectRegimeChange(metric: 'registered' | 'eligible', days: number = 7): Promise<boolean> {
  const recentData = await prisma.dailySpread.findMany({
    take: days,
    orderBy: {
      date: 'desc',
    },
    select: {
      [metric]: true,
    },
  });
  
  if (recentData.length < days) {
    return false;
  }
  
  // Check if all consecutive days show decline
  for (let i = 0; i < recentData.length - 1; i++) {
    const current = recentData[i][metric];
    const previous = recentData[i + 1][metric];
    
    if (current >= previous) {
      return false;
    }
  }
  
  return true;
}

/**
 * Calculates registered percentage
 */
export function calculateRegisteredPercent(registered: number, total: number): number {
  if (total === 0) {
    return 0;
  }
  return (registered / total) * 100;
}

/**
 * Calculates Physical Stress Index (PSI)
 * 
 * PSI combines two key factors:
 * 1. Price spread (SGE premium over COMEX) - indicates physical demand pressure
 * 2. Registered ratio (Registered/Total) - indicates available deliverable supply
 * 
 * Formula: PSI = spreadUsdPerOz / (registeredPercent / 100)
 * 
 * Interpretation:
 * - PSI > 10: Extreme stress (high premium + low registered)
 * - PSI 5-10: High stress
 * - PSI 2-5: Moderate stress
 * - PSI < 2: Low stress
 * 
 * Example:
 * - Spread: $2.00/oz, Registered: 20% → PSI = 2.00 / 0.20 = 10 (extreme)
 * - Spread: $1.00/oz, Registered: 50% → PSI = 1.00 / 0.50 = 2 (low)
 */
export function calculatePhysicalStressIndex(params: {
  spreadUsdPerOz: number;
  totalRegistered: number;
  totalCombined: number;
}): {
  psi: number | null;
  registeredPercent: number;
  stressLevel: 'EXTREME' | 'HIGH' | 'MODERATE' | 'LOW' | 'UNKNOWN';
} {
  const { spreadUsdPerOz, totalRegistered, totalCombined } = params;
  
  // Calculate registered percentage
  const registeredPercent = calculateRegisteredPercent(totalRegistered, totalCombined);
  
  // Prevent division by zero
  if (registeredPercent === 0 || totalCombined === 0) {
    return {
      psi: null,
      registeredPercent,
      stressLevel: 'UNKNOWN',
    };
  }
  
  // PSI = spread / (registered_ratio)
  // Convert percentage to ratio by dividing by 100
  const psi = spreadUsdPerOz / (registeredPercent / 100);
  
  // Classify stress level
  let stressLevel: 'EXTREME' | 'HIGH' | 'MODERATE' | 'LOW' | 'UNKNOWN';
  if (psi > 10) {
    stressLevel = 'EXTREME';
  } else if (psi > 5) {
    stressLevel = 'HIGH';
  } else if (psi > 2) {
    stressLevel = 'MODERATE';
  } else {
    stressLevel = 'LOW';
  }
  
  return {
    psi,
    registeredPercent,
    stressLevel,
  };
}

/**
 * Historical PSI analysis
 * Returns PSI trends over time
 */
export async function analyzePsiTrend(days: number = 30): Promise<{
  current: number | null;
  average: number;
  max: number;
  min: number;
  trend: 'INCREASING' | 'DECREASING' | 'STABLE';
} | null> {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  
  const spreads = await prisma.dailySpread.findMany({
    where: {
      date: {
        gte: startDate,
      },
      psi: {
        not: null,
      },
    },
    orderBy: {
      date: 'asc',
    },
    select: {
      psi: true,
      date: true,
    },
  });
  
  if (spreads.length < 2) {
    return null;
  }
  
  const psiValues = spreads.map(s => s.psi!).filter(v => v !== null);
  const current = psiValues[psiValues.length - 1];
  const average = psiValues.reduce((a, b) => a + b, 0) / psiValues.length;
  const max = Math.max(...psiValues);
  const min = Math.min(...psiValues);
  
  // Simple trend detection: compare recent vs older values
  const midpoint = Math.floor(psiValues.length / 2);
  const recentAvg = psiValues.slice(midpoint).reduce((a, b) => a + b, 0) / (psiValues.length - midpoint);
  const olderAvg = psiValues.slice(0, midpoint).reduce((a, b) => a + b, 0) / midpoint;
  
  let trend: 'INCREASING' | 'DECREASING' | 'STABLE';
  const change = ((recentAvg - olderAvg) / olderAvg) * 100;
  
  if (change > 10) {
    trend = 'INCREASING';
  } else if (change < -10) {
    trend = 'DECREASING';
  } else {
    trend = 'STABLE';
  }
  
  return {
    current,
    average,
    max,
    min,
    trend,
  };
}
