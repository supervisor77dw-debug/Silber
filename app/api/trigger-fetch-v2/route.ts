import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { fetchComexStocks } from '@/lib/fetchers/comex';
import { fetchFxRateWithRetry } from '@/lib/fetchers/fx';
import { fetchSgePrice } from '@/lib/fetchers/sge';
import { fetchComexSpotPriceWithRetry } from '@/lib/fetchers/comex-price';
import { 
  calculateSpread, 
  calculateRegisteredPercent,
  calculatePhysicalStressIndex
} from '@/lib/calculations';
import { startOfDay } from 'date-fns';
import type { FetchAttempt } from '@/lib/types/result';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Data fetch endpoint - resilient, always returns 200
 * Reports what succeeded/failed but never throws
 */
export async function POST() {
  const marketDate = startOfDay(new Date());
  const attempts: FetchAttempt[] = [];
  const errors: string[] = [];

  let comexData: any = null;
  let fxData: any = null;
  let sgePriceData: any = null;
  let comexPriceData: any = null;

  // COMEX Stocks - with fallback chain
  try {
    comexData = await fetchComexStocks();
    
    if (comexData) {
      await prisma.comexStock.upsert({
        where: { date: marketDate },
        create: {
          date: marketDate,
          totalRegistered: comexData.totalRegistered,
          totalEligible: comexData.totalEligible,
          totalCombined: comexData.totalCombined,
          registeredPercent: calculateRegisteredPercent(comexData.totalRegistered, comexData.totalCombined),
        },
        update: {
          totalRegistered: comexData.totalRegistered,
          totalEligible: comexData.totalEligible,
          totalCombined: comexData.totalCombined,
          registeredPercent: calculateRegisteredPercent(comexData.totalRegistered, comexData.totalCombined),
        },
      });
      attempts.push({ source: 'COMEX', status: 'ok', timestamp: new Date(), success: true });
    } else {
      // Fallback 1: Last known DB value
      const lastStock = await prisma.comexStock.findFirst({ orderBy: { date: 'desc' } });
      
      if (lastStock) {
        comexData = {
          date: marketDate,
          totalRegistered: lastStock.totalRegistered,
          totalEligible: lastStock.totalEligible,
          totalCombined: lastStock.totalCombined,
        };
        attempts.push({ 
          source: 'COMEX', 
          status: 'stale', 
          timestamp: new Date(), 
          success: true,
          message: `Using last known values from ${lastStock.date.toISOString().split('T')[0]}`
        });
      } else {
        // Fallback 2: Default values
        const defaultRegistered = 50000000;
        const defaultEligible = 250000000;
        comexData = {
          date: marketDate,
          totalRegistered: defaultRegistered,
          totalEligible: defaultEligible,
          totalCombined: defaultRegistered + defaultEligible,
        };
        attempts.push({ 
          source: 'COMEX', 
          status: 'unavailable', 
          timestamp: new Date(), 
          success: false,
          message: 'Using default fallback values (no live data, no DB history)'
        });
      }
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    errors.push(`COMEX: ${errorMsg}`);
    attempts.push({ 
      source: 'COMEX', 
      status: 'unavailable', 
      timestamp: new Date(), 
      success: false,
      error: errorMsg
    });
    
    // Still try fallback
    try {
      const lastStock = await prisma.comexStock.findFirst({ orderBy: { date: 'desc' } });
      if (lastStock) {
        comexData = {
          date: marketDate,
          totalRegistered: lastStock.totalRegistered,
          totalEligible: lastStock.totalEligible,
          totalCombined: lastStock.totalCombined,
        };
      }
    } catch {}
  }

  // FX Rate
  try {
    fxData = await fetchFxRateWithRetry(marketDate, 2);
    
    if (fxData) {
      await prisma.fxRate.upsert({
        where: { date: marketDate },
        create: {
          date: marketDate,
          usdCnyRate: fxData.usdCnyRate,
          source: fxData.source,
        },
        update: {
          usdCnyRate: fxData.usdCnyRate,
          source: fxData.source,
        },
      });
      attempts.push({ source: 'FX', status: 'ok', timestamp: new Date(), success: true });
    } else {
      const lastFx = await prisma.fxRate.findFirst({ orderBy: { date: 'desc' } });
      if (lastFx) {
        fxData = lastFx;
        attempts.push({ 
          source: 'FX', 
          status: 'stale', 
          timestamp: new Date(), 
          success: true,
          message: `Using last known rate from ${lastFx.date.toISOString().split('T')[0]}`
        });
      } else {
        attempts.push({ source: 'FX', status: 'unavailable', timestamp: new Date(), success: false });
      }
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    errors.push(`FX: ${errorMsg}`);
    attempts.push({ source: 'FX', status: 'unavailable', timestamp: new Date(), success: false, error: errorMsg });
  }

  // COMEX Price
  try {
    comexPriceData = await fetchComexSpotPriceWithRetry(marketDate, 2);
    
    if (comexPriceData && comexPriceData.priceUsdPerOz > 0) {
      await prisma.comexPrice.upsert({
        where: { marketDate: marketDate },
        create: {
          marketDate: marketDate,
          priceUsdPerOz: comexPriceData.priceUsdPerOz,
          contract: comexPriceData.contract,
        },
        update: {
          priceUsdPerOz: comexPriceData.priceUsdPerOz,
          contract: comexPriceData.contract,
        },
      });
      attempts.push({ source: 'COMEX_PRICE', status: 'ok', timestamp: new Date(), success: true });
    } else {
      const lastPrice = await prisma.comexPrice.findFirst({ orderBy: { marketDate: 'desc' } });
      if (lastPrice) {
        comexPriceData = lastPrice;
        attempts.push({ 
          source: 'COMEX_PRICE', 
          status: 'stale', 
          timestamp: new Date(), 
          success: true,
          message: `Using last known price from ${lastPrice.marketDate.toISOString().split('T')[0]}`
        });
      } else {
        attempts.push({ source: 'COMEX_PRICE', status: 'unavailable', timestamp: new Date(), success: false });
      }
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    errors.push(`COMEX_PRICE: ${errorMsg}`);
    attempts.push({ source: 'COMEX_PRICE', status: 'unavailable', timestamp: new Date(), success: false, error: errorMsg });
  }

  // SGE Price (only if we have FX rate)
  if (fxData?.usdCnyRate) {
    try {
      sgePriceData = await fetchSgePrice(marketDate, fxData.usdCnyRate, comexPriceData?.priceUsdPerOz);
      
      if (sgePriceData) {
        await prisma.sgePrice.upsert({
          where: { date: marketDate },
          create: {
            date: marketDate,
            priceCnyPerGram: sgePriceData.priceCnyPerGram,
            priceUsdPerOz: sgePriceData.priceUsdPerOz,
            fxRateUsed: fxData.usdCnyRate,
          },
          update: {
            priceCnyPerGram: sgePriceData.priceCnyPerGram,
            priceUsdPerOz: sgePriceData.priceUsdPerOz,
            fxRateUsed: fxData.usdCnyRate,
          },
        });
        attempts.push({ source: 'SGE', status: 'ok', timestamp: new Date(), success: true });
      } else {
        const lastSge = await prisma.sgePrice.findFirst({ orderBy: { date: 'desc' } });
        if (lastSge) {
          sgePriceData = lastSge;
          attempts.push({ 
            source: 'SGE', 
            status: 'stale', 
            timestamp: new Date(), 
            success: true,
            message: `Using last known price from ${lastSge.date.toISOString().split('T')[0]}`
          });
        } else {
          attempts.push({ source: 'SGE', status: 'unavailable', timestamp: new Date(), success: false });
        }
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      errors.push(`SGE: ${errorMsg}`);
      attempts.push({ source: 'SGE', status: 'unavailable', timestamp: new Date(), success: false, error: errorMsg });
    }
  } else {
    attempts.push({ 
      source: 'SGE', 
      status: 'unavailable', 
      timestamp: new Date(), 
      success: false,
      message: 'Skipped - FX rate not available'
    });
  }

  // Calculate spread if we have necessary data
  if (sgePriceData && comexPriceData && comexData) {
    try {
      const spread = calculateSpread(
        sgePriceData.priceUsdPerOz,
        comexPriceData.priceUsdPerOz
      );
      
      const psiResult = calculatePhysicalStressIndex({
        spreadUsdPerOz: spread.spreadUsdPerOz,
        totalRegistered: comexData.totalRegistered,
        totalCombined: comexData.totalCombined,
      });

      await prisma.dailySpread.upsert({
        where: { date: marketDate },
        create: {
          date: marketDate,
          sgeUsdPerOz: sgePriceData.priceUsdPerOz,
          comexUsdPerOz: comexPriceData.priceUsdPerOz,
          spreadUsdPerOz: spread.spreadUsdPerOz,
          spreadPercent: spread.spreadPercent,
          registered: comexData.totalRegistered,
          eligible: comexData.totalEligible,
          total: comexData.totalCombined,
          registeredPercent: psiResult.registeredPercent,
          psi: psiResult.psi,
          psiStressLevel: psiResult.stressLevel,
        },
        update: {
          sgeUsdPerOz: sgePriceData.priceUsdPerOz,
          comexUsdPerOz: comexPriceData.priceUsdPerOz,
          spreadUsdPerOz: spread.spreadUsdPerOz,
          spreadPercent: spread.spreadPercent,
          registered: comexData.totalRegistered,
          eligible: comexData.totalEligible,
          total: comexData.totalCombined,
          registeredPercent: psiResult.registeredPercent,
          psi: psiResult.psi,
          psiStressLevel: psiResult.stressLevel,
        },
      });
      attempts.push({ source: 'SPREAD_CALC', status: 'ok', timestamp: new Date(), success: true });
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      errors.push(`SPREAD_CALC: ${errorMsg}`);
      attempts.push({ source: 'SPREAD_CALC', status: 'unavailable', timestamp: new Date(), success: false, error: errorMsg });
    }
  } else {
    const missing = [];
    if (!sgePriceData) missing.push('SGE price');
    if (!comexPriceData) missing.push('COMEX price');
    if (!comexData) missing.push('COMEX stocks');
    
    attempts.push({ 
      source: 'SPREAD_CALC', 
      status: 'unavailable', 
      timestamp: new Date(), 
      success: false,
      message: `Missing required data: ${missing.join(', ')}`
    });
  }

  const successCount = attempts.filter(a => a.success).length;
  const totalCount = attempts.length;

  return NextResponse.json({
    success: successCount > 0,
    summary: {
      successful: successCount,
      total: totalCount,
      hasErrors: errors.length > 0,
    },
    attempts,
    errors: errors.length > 0 ? errors : undefined,
    date: marketDate.toISOString(),
  }, { status: 200 }); // Always 200, even if some sources failed
}
