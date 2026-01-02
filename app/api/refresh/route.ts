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
import { startOfDay } from 'date-fns';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Refresh Endpoint: Manueller Live-Datenabruf
 * 
 * POST /api/refresh
 * 
 * Holt aktuelle Live-Daten und schreibt in DB.
 * Gibt detaillierte Ergebnisse zurück (welche Quellen erfolgreich waren).
 * 
 * Fehlerbehandlung: Immer 200 Status, auch bei Teil-Fehlern.
 */

interface RefreshAttempt {
  source: string;
  status: 'success' | 'failed' | 'unavailable';
  timestamp: string;
  message?: string;
  error?: string;
  value?: any;
}

export async function POST(req: NextRequest) {
  const attempts: RefreshAttempt[] = [];
  const today = startOfDay(new Date());
  
  try {
    // 1) COMEX Stocks
    let comexStocks: any = null;
    try {
      comexStocks = await fetchComexStocks();
      
      if (comexStocks) {
        await prisma.comexStock.upsert({
          where: { date: today },
          create: {
            date: today,
            totalRegistered: comexStocks.totalRegistered,
            totalEligible: comexStocks.totalEligible,
            totalCombined: comexStocks.totalCombined,
            registeredPercent: comexStocks.registeredPercent,
            deltaRegistered: comexStocks.deltaRegistered,
            deltaEligible: comexStocks.deltaEligible,
            deltaCombined: comexStocks.deltaCombined,
            sourceUrl: comexStocks.sourceUrl,
            isValidated: true
          },
          update: {
            totalRegistered: comexStocks.totalRegistered,
            totalEligible: comexStocks.totalEligible,
            totalCombined: comexStocks.totalCombined,
            registeredPercent: comexStocks.registeredPercent,
            deltaRegistered: comexStocks.deltaRegistered,
            deltaEligible: comexStocks.deltaEligible,
            deltaCombined: comexStocks.deltaCombined,
            sourceUrl: comexStocks.sourceUrl,
            fetchedAt: new Date()
          }
        });
        
        attempts.push({
          source: 'COMEX Stocks',
          status: 'success',
          timestamp: new Date().toISOString(),
          message: `${(comexStocks.totalRegistered / 1_000_000).toFixed(1)}M oz registered`,
          value: comexStocks
        });
      } else {
        throw new Error('fetchComexStocks returned null');
      }
    } catch (err: any) {
      console.error('[Refresh] COMEX Stocks failed:', err.message);
      
      // Fallback: Letzten DB-Wert laden
      const lastStock = await prisma.comexStock.findFirst({
        orderBy: { date: 'desc' }
      });
      
      if (lastStock) {
        comexStocks = {
          totalRegistered: lastStock.totalRegistered,
          totalEligible: lastStock.totalEligible,
          totalCombined: lastStock.totalCombined,
          registeredPercent: lastStock.registeredPercent
        };
        
        attempts.push({
          source: 'COMEX Stocks',
          status: 'unavailable',
          timestamp: new Date().toISOString(),
          message: `Live nicht verfügbar - nutze DB-Wert vom ${lastStock.date.toISOString().split('T')[0]}`,
          error: err.message,
          value: comexStocks
        });
      } else {
        attempts.push({
          source: 'COMEX Stocks',
          status: 'failed',
          timestamp: new Date().toISOString(),
          error: err.message,
          message: 'Keine Live-Daten und keine DB-Historie verfügbar'
        });
      }
    }
    
    // 2) FX Rate (USD/CNY)
    let fxRate: number | null = null;
    try {
      const fxResult = await fetchFxRateWithRetry(today);
      
      if (fxResult && fxResult.usdCnyRate > 0) {
        fxRate = fxResult.usdCnyRate;
        
        await prisma.fxRate.upsert({
          where: { date: today },
          create: {
            date: today,
            usdCnyRate: fxRate,
            source: 'ECB'
          },
          update: {
            usdCnyRate: fxRate,
            fetchedAt: new Date()
          }
        });
        
        attempts.push({
          source: 'FX Rate',
          status: 'success',
          timestamp: new Date().toISOString(),
          message: `USD/CNY: ${fxRate.toFixed(4)}`,
          value: fxRate
        });
      } else {
        throw new Error('FX rate invalid or zero');
      }
    } catch (err: any) {
      console.error('[Refresh] FX Rate failed:', err.message);
      
      const lastFx = await prisma.fxRate.findFirst({
        orderBy: { date: 'desc' }
      });
      
      if (lastFx) {
        fxRate = lastFx.usdCnyRate;
        attempts.push({
          source: 'FX Rate',
          status: 'unavailable',
          timestamp: new Date().toISOString(),
          message: `Live nicht verfügbar - nutze DB-Wert vom ${lastFx.date.toISOString().split('T')[0]}: ${fxRate.toFixed(4)}`,
          error: err.message,
          value: fxRate
        });
      } else {
        attempts.push({
          source: 'FX Rate',
          status: 'failed',
          timestamp: new Date().toISOString(),
          error: err.message,
          message: 'Keine Live-Daten und keine DB-Historie verfügbar'
        });
      }
    }
    
    // 3) COMEX Price
    let comexPrice: number | null = null;
    try {
      const comexResult = await fetchComexSpotPriceWithRetry(today);
      
      if (comexResult && comexResult.priceUsdPerOz > 0) {
        comexPrice = comexResult.priceUsdPerOz;
        
        await prisma.comexPrice.upsert({
          where: { marketDate: today },
          create: {
            marketDate: today,
            priceUsdPerOz: comexPrice,
            contract: comexResult.contract || 'Spot',
            sourceName: 'metals-api'
          },
          update: {
            priceUsdPerOz: comexPrice,
            fetchedAt: new Date()
          }
        });
        
        attempts.push({
          source: 'COMEX Price',
          status: 'success',
          timestamp: new Date().toISOString(),
          message: `${comexPrice.toFixed(2)} USD/oz`,
          value: comexPrice
        });
      } else {
        throw new Error('COMEX price invalid or zero');
      }
    } catch (err: any) {
      console.error('[Refresh] COMEX Price failed:', err.message);
      
      const lastPrice = await prisma.comexPrice.findFirst({
        orderBy: { marketDate: 'desc' }
      });
      
      if (lastPrice) {
        comexPrice = lastPrice.priceUsdPerOz;
        attempts.push({
          source: 'COMEX Price',
          status: 'unavailable',
          timestamp: new Date().toISOString(),
          message: `Live nicht verfügbar - nutze DB-Wert vom ${lastPrice.marketDate.toISOString().split('T')[0]}: ${comexPrice.toFixed(2)} USD/oz`,
          error: err.message,
          value: comexPrice
        });
      } else {
        attempts.push({
          source: 'COMEX Price',
          status: 'failed',
          timestamp: new Date().toISOString(),
          error: err.message,
          message: 'Keine Live-Daten und keine DB-Historie verfügbar'
        });
      }
    }
    
    // 4) SGE Price (benötigt FX Rate)
    let sgePrice: number | null = null;
    try {
      if (!fxRate) {
        throw new Error('FX Rate nicht verfügbar - SGE Preis kann nicht berechnet werden');
      }
      
      const sgeResult = await fetchSgePrice(today, fxRate, comexPrice);
      
      if (sgeResult && sgeResult.priceUsdPerOz > 0) {
        sgePrice = sgeResult.priceUsdPerOz;
        
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
            sourceUrl: 'multi-provider',
            fetchedAt: new Date()
          }
        });
        
        attempts.push({
          source: 'SGE Price',
          status: 'success',
          timestamp: new Date().toISOString(),
          message: `${sgePrice.toFixed(2)} USD/oz (multi-provider)`,
          value: sgePrice
        });
      } else {
        throw new Error('SGE price invalid or zero');
      }
    } catch (err: any) {
      console.error('[Refresh] SGE Price failed:', err.message);
      
      const lastSge = await prisma.sgePrice.findFirst({
        orderBy: { date: 'desc' }
      });
      
      if (lastSge) {
        sgePrice = lastSge.priceUsdPerOz;
        attempts.push({
          source: 'SGE Price',
          status: 'unavailable',
          timestamp: new Date().toISOString(),
          message: `Live nicht verfügbar - nutze DB-Wert vom ${lastSge.date.toISOString().split('T')[0]}: ${sgePrice.toFixed(2)} USD/oz`,
          error: err.message,
          value: sgePrice
        });
      } else {
        attempts.push({
          source: 'SGE Price',
          status: 'failed',
          timestamp: new Date().toISOString(),
          error: err.message,
          message: 'Keine Live-Daten und keine DB-Historie verfügbar'
        });
      }
    }
    
    // 5) Spread berechnen und speichern
    let spreadCalculated = false;
    if (sgePrice && comexPrice && comexStocks) {
      try {
        const spreadResult = calculateSpread(sgePrice, comexPrice);
        const registeredPercent = calculateRegisteredPercent(comexStocks.totalRegistered, comexStocks.totalCombined);
        const psiResult = calculatePhysicalStressIndex({
          spreadUsdPerOz: spreadResult.spreadUsdPerOz,
          totalRegistered: comexStocks.totalRegistered,
          totalCombined: comexStocks.totalCombined
        });
        
        await prisma.dailySpread.upsert({
          where: { date: today },
          create: {
            date: today,
            sgeUsdPerOz: sgePrice,
            comexUsdPerOz: comexPrice,
            spreadUsdPerOz: spreadResult.spreadUsdPerOz,
            spreadPercent: spreadResult.spreadPercent,
            registered: comexStocks.totalRegistered,
            eligible: comexStocks.totalEligible,
            total: comexStocks.totalCombined,
            registeredPercent: registeredPercent,
            psi: psiResult.psi,
            psiStressLevel: psiResult.stressLevel,
            dataQuality: 'OK'
          },
          update: {
            sgeUsdPerOz: sgePrice,
            comexUsdPerOz: comexPrice,
            spreadUsdPerOz: spreadResult.spreadUsdPerOz,
            spreadPercent: spreadResult.spreadPercent,
            registered: comexStocks.totalRegistered,
            eligible: comexStocks.totalEligible,
            total: comexStocks.totalCombined,
            registeredPercent: registeredPercent,
            psi: psiResult.psi,
            psiStressLevel: psiResult.stressLevel
          }
        });
        
        spreadCalculated = true;
        
        attempts.push({
          source: 'Spread Calculation',
          status: 'success',
          timestamp: new Date().toISOString(),
          message: `Spread: ${spreadResult.spreadUsdPerOz.toFixed(2)} USD/oz (${spreadResult.spreadPercent.toFixed(2)}%), PSI: ${psiResult.psi ? psiResult.psi.toFixed(2) : 'N/A'} (${psiResult.stressLevel})`,
          value: { ...spreadResult, ...psiResult }
        });
      } catch (err: any) {
        console.error('[Refresh] Spread calculation failed:', err.message);
        attempts.push({
          source: 'Spread Calculation',
          status: 'failed',
          timestamp: new Date().toISOString(),
          error: err.message
        });
      }
    } else {
      attempts.push({
        source: 'Spread Calculation',
        status: 'failed',
        timestamp: new Date().toISOString(),
        message: 'Nicht alle erforderlichen Daten verfügbar (SGE, COMEX Price, COMEX Stocks)'
      });
    }
    
    // 6) Summary
    const successful = attempts.filter(a => a.status === 'success').length;
    const unavailable = attempts.filter(a => a.status === 'unavailable').length;
    const failed = attempts.filter(a => a.status === 'failed').length;
    
    const hasErrors = failed > 0;
    const partialSuccess = successful > 0 && (unavailable > 0 || failed > 0);
    
    return NextResponse.json({
      success: successful > 0,
      timestamp: new Date().toISOString(),
      summary: {
        successful,
        unavailable,
        failed,
        total: attempts.length,
        spreadCalculated,
        hasErrors,
        partialSuccess
      },
      attempts,
      message: partialSuccess 
        ? `Teilweise erfolgreich: ${successful} live, ${unavailable} aus DB, ${failed} fehlgeschlagen`
        : successful > 0
        ? `Erfolgreich: Alle ${successful} Datenquellen aktualisiert`
        : 'Fehler: Keine Datenquellen verfügbar'
    });
    
  } catch (error: any) {
    console.error('[Refresh] Unerwarteter Fehler:', error);
    
    return NextResponse.json({
      success: false,
      timestamp: new Date().toISOString(),
      summary: {
        successful: 0,
        unavailable: 0,
        failed: attempts.length,
        total: attempts.length,
        spreadCalculated: false,
        hasErrors: true,
        partialSuccess: false
      },
      attempts,
      error: error.message,
      message: 'Refresh fehlgeschlagen'
    });
  }
}
