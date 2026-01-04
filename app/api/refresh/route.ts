import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { fetchComexStocks } from '@/lib/fetchers/comex';
import { fetchSgePrice } from '@/lib/fetchers/sge';
import { fetchFxRateWithRetry } from '@/lib/fetchers/fx';
import { fetchComexSpotPriceWithRetry } from '@/lib/fetchers/comex-price';
import { 
  calculateSpread, 
  calculateRegisteredPercent,
  calculatePhysicalStressIndex 
} from '@/lib/calculations';
import { startOfDay, format } from 'date-fns';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Refresh Endpoint - ARCHITEKTUR-KORREKT
 * 
 * Grundregel: Live-APIs schreiben NUR in DB, nie direkt ins UI
 * 
 * POST /api/refresh
 * 
 * Verhalten:
 * - Versucht jede Quelle zu fetchen
 * - Bei Erfolg: upsert in DB
 * - Bei Fehler: skip (kein throw!)
 * - Gibt Status zurück, UI lädt danach aus DB
 */
export async function POST(req: NextRequest) {
  const today = startOfDay(new Date());
  const updated: string[] = [];
  const skipped: string[] = [];
  const sourceStatus: Record<string, 'live' | 'db' | 'unavailable'> = {};
  
  // 1) COMEX Stocks
  try {
    const comexData = await fetchComexStocks();
    
    if (comexData) {
      await prisma.comexStock.upsert({
        where: { date: today },
        create: {
          date: today,
          totalRegistered: comexData.totalRegistered,
          totalEligible: comexData.totalEligible,
          totalCombined: comexData.totalCombined,
          registeredPercent: calculateRegisteredPercent(comexData.totalRegistered, comexData.totalCombined),
          isValidated: true
        },
        update: {
          totalRegistered: comexData.totalRegistered,
          totalEligible: comexData.totalEligible,
          totalCombined: comexData.totalCombined,
          registeredPercent: calculateRegisteredPercent(comexData.totalRegistered, comexData.totalCombined),
          fetchedAt: new Date()
        }
      });
      
      updated.push('comex');
      sourceStatus.comex = 'live';
    }
  } catch (err) {
    console.warn('[Refresh] COMEX skip:', err instanceof Error ? err.message : String(err));
    skipped.push('comex');
    sourceStatus.comex = 'db';
  }
  
  // 2) FX Rate
  try {
    const fxResult = await fetchFxRateWithRetry(today);
    
    if (fxResult && fxResult.usdCnyRate > 0) {
      await prisma.fxRate.upsert({
        where: { date: today },
        create: {
          date: today,
          usdCnyRate: fxResult.usdCnyRate,
          source: 'ECB'
        },
        update: {
          usdCnyRate: fxResult.usdCnyRate,
          fetchedAt: new Date()
        }
      });
      
      updated.push('fx');
      sourceStatus.fx = 'live';
    }
  } catch (err) {
    console.warn('[Refresh] FX skip:', err instanceof Error ? err.message : String(err));
    skipped.push('fx');
    sourceStatus.fx = 'db';
  }
  
  // 3) COMEX Price
  try {
    const comexPriceResult = await fetchComexSpotPriceWithRetry(today);
    
    if (comexPriceResult && comexPriceResult.priceUsdPerOz > 0) {
      await prisma.comexPrice.upsert({
        where: { marketDate: today },
        create: {
          marketDate: today,
          priceUsdPerOz: comexPriceResult.priceUsdPerOz,
          contract: comexPriceResult.contract || 'Spot',
          sourceName: 'metals-api'
        },
        update: {
          priceUsdPerOz: comexPriceResult.priceUsdPerOz,
          fetchedAt: new Date()
        }
      });
      
      // Also store in metal_prices for historical charts
      await prisma.metalPrice.upsert({
        where: { date: today },
        create: {
          date: today,
          xagUsdClose: comexPriceResult.priceUsdPerOz,
          source: 'live-api'
        },
        update: {
          xagUsdClose: comexPriceResult.priceUsdPerOz,
          fetchedAt: new Date()
        }
      });
      
      updated.push('comex_price');
      sourceStatus.comex_price = 'live';
    }
  } catch (err) {
    console.warn('[Refresh] COMEX Price skip:', err instanceof Error ? err.message : String(err));
    skipped.push('comex_price');
    sourceStatus.comex_price = 'db';
  }
  
  // 4) SGE Price (needs FX)
  try {
    // Get FX rate (live or latest from DB)
    let fxRate: number | null = null;
    const latestFx = await prisma.fxRate.findFirst({
      orderBy: { date: 'desc' }
    });
    
    if (latestFx) {
      fxRate = latestFx.usdCnyRate;
      
      // Get COMEX price for SGE estimation fallback
      const latestComexPrice = await prisma.comexPrice.findFirst({
        orderBy: { marketDate: 'desc' }
      });
      
      const sgeResult = await fetchSgePrice(today, fxRate, latestComexPrice?.priceUsdPerOz);
      
      if (sgeResult && sgeResult.priceUsdPerOz > 0) {
        await prisma.sgePrice.upsert({
          where: { date: today },
          create: {
            date: today,
            priceCnyPerGram: sgeResult.priceCnyPerGram,
            priceUsdPerOz: sgeResult.priceUsdPerOz,
            fxRateUsed: fxRate,
            sourceUrl: 'multi-provider',
            isValidated: true
          },
          update: {
            priceCnyPerGram: sgeResult.priceCnyPerGram,
            priceUsdPerOz: sgeResult.priceUsdPerOz,
            fxRateUsed: fxRate,
            fetchedAt: new Date()
          }
        });
        
        updated.push('sge');
        sourceStatus.sge = 'live';
      }
    } else {
      throw new Error('No FX rate available (neither live nor DB)');
    }
  } catch (err) {
    console.warn('[Refresh] SGE skip:', err instanceof Error ? err.message : String(err));
    skipped.push('sge');
    sourceStatus.sge = 'db';
  }
  
  // 5) Calculate spread if we have all data
  try {
    const latestComexPrice = await prisma.comexPrice.findFirst({
      where: { marketDate: today },
      orderBy: { marketDate: 'desc' }
    });
    
    const latestSgePrice = await prisma.sgePrice.findFirst({
      where: { date: today },
      orderBy: { date: 'desc' }
    });
    
    const latestComexStock = await prisma.comexStock.findFirst({
      where: { date: today },
      orderBy: { date: 'desc' }
    });
    
    if (latestComexPrice && latestSgePrice && latestComexStock) {
      const spreadResult = calculateSpread(
        latestSgePrice.priceUsdPerOz,
        latestComexPrice.priceUsdPerOz
      );
      
      const psiResult = calculatePhysicalStressIndex({
        spreadUsdPerOz: spreadResult.spreadUsdPerOz,
        totalRegistered: latestComexStock.totalRegistered,
        totalCombined: latestComexStock.totalCombined
      });
      
      await prisma.dailySpread.upsert({
        where: { date: today },
        create: {
          date: today,
          sgeUsdPerOz: latestSgePrice.priceUsdPerOz,
          comexUsdPerOz: latestComexPrice.priceUsdPerOz,
          spreadUsdPerOz: spreadResult.spreadUsdPerOz,
          spreadPercent: spreadResult.spreadPercent,
          registered: latestComexStock.totalRegistered,
          eligible: latestComexStock.totalEligible,
          total: latestComexStock.totalCombined,
          registeredPercent: psiResult.registeredPercent,
          psi: psiResult.psi,
          psiStressLevel: psiResult.stressLevel,
          dataQuality: 'OK'
        },
        update: {
          sgeUsdPerOz: latestSgePrice.priceUsdPerOz,
          comexUsdPerOz: latestComexPrice.priceUsdPerOz,
          spreadUsdPerOz: spreadResult.spreadUsdPerOz,
          spreadPercent: spreadResult.spreadPercent,
          registered: latestComexStock.totalRegistered,
          eligible: latestComexStock.totalEligible,
          total: latestComexStock.totalCombined,
          registeredPercent: psiResult.registeredPercent,
          psi: psiResult.psi,
          psiStressLevel: psiResult.stressLevel
        }
      });
      
      updated.push('spread');
    }
  } catch (err) {
    console.warn('[Refresh] Spread calculation skip:', err instanceof Error ? err.message : String(err));
    skipped.push('spread');
  }
  
  // Response: Status only, NO data
  return NextResponse.json({
    date: format(today, 'yyyy-MM-dd'),
    updated,
    skipped,
    sourceStatus,
    message: updated.length > 0 
      ? `Updated ${updated.length} sources, skipped ${skipped.length}`
      : 'All sources unavailable, using DB data'
  });
}
