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

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;
export const revalidate = 0;

/**
 * GET handler - Returns API usage instructions
 */
export async function GET() {
  return NextResponse.json({
    error: 'Method Not Allowed',
    message: 'This endpoint requires POST method with Authorization header',
    usage: {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer <your-secret-token>'
      },
      example: 'curl -X POST https://silber-ten.vercel.app/api/refresh -H "Authorization: Bearer YOUR_TOKEN"'
    }
  }, { status: 405 });
}

/**
 * OPTIONS handler for CORS preflight
 */
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Allow': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    },
  });
}

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
  console.log('[API HIT]', new Date().toISOString());
  console.log('[REFRESH_START]', new Date().toISOString());
  
  // Bearer Auth REQUIRED
  const authHeader = req.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    console.warn('[REFRESH_AUTH_FAIL]', { hasHeader: !!authHeader, hasSecret: !!cronSecret });
    return NextResponse.json(
      { ok: false, error: 'UNAUTHORIZED' },
      { status: 401 }
    );
  }
  
  console.log('[AUTH_OK]');
  
  const today = startOfDay(new Date());
  const updated: string[] = [];
  const skipped: string[] = [];
  const errors: string[] = [];
  const sourceStatus: Record<string, 'live' | 'db' | 'unavailable'> = {};
  const wrote = { retail: 0, metal: 0 };
  
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
  
  // 3) COMEX Price (Best Effort, 8s timeout)
  try {
    console.log('[FETCH_COMEX_PRICE_START]');
    
    const timeoutPromise = new Promise<null>((_, reject) => 
      setTimeout(() => reject(new Error('Timeout after 8s')), 8000)
    );
    
    const comexPriceResult = await Promise.race([
      fetchComexSpotPriceWithRetry(today),
      timeoutPromise
    ]);
    
    if (comexPriceResult && comexPriceResult.priceUsdPerOz > 0) {
      // Write to comex_prices table
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
      
      // ALWAYS write to metal_prices for charts (decoupled)
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
      
      console.log('[DB WRITE]', { table: 'metal_prices', date: format(today, 'yyyy-MM-dd'), value: comexPriceResult.priceUsdPerOz });
      wrote.metal++;
      updated.push('comex_price');
      sourceStatus.comex_price = 'live';
      console.log('[FETCH_COMEX_PRICE_OK]', comexPriceResult.priceUsdPerOz);
    } else {
      console.warn('[FETCH_COMEX_PRICE_NO_DATA]');
      errors.push('comex_price: No data returned');
      sourceStatus.comex_price = 'db';
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn('[FETCH_COMEX_PRICE_FAIL]', msg);
    errors.push(`comex_price: ${msg}`);
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
  
  // 5) Retail Prices (Degussa, ProAurum)
  try {
    console.log('[FETCH_RETAIL_START]');
    
    // Mock data - später durch echten Fetch ersetzen
    const retailData = [
      {
        provider: 'Degussa',
        product: '1oz Maple Leaf',
        priceEur: 35.50,
        fineOz: 1.0,
      },
      {
        provider: 'ProAurum',
        product: '1oz Philharmoniker',
        priceEur: 35.80,
        fineOz: 1.0,
      },
    ];
    
    console.log('[FETCH_RETAIL_OK]', retailData.length, 'items');
    
    for (const item of retailData) {
      await prisma.retailPrice.create({
        data: {
          date: today,
          provider: item.provider,
          product: item.product,
          priceEur: item.priceEur,
          fineOz: item.fineOz,
          source: 'mock',
        },
      });
      wrote.retail++;
    }
    
    console.log('[DB_WRITE_OK]', 'retail:', wrote.retail);
    updated.push('retail');
    sourceStatus.retail = 'live';
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[RETAIL_ERROR]', msg);
    errors.push(`retail: ${msg}`);
    skipped.push('retail');
    sourceStatus.retail = 'unavailable';
  }
  
  // 6) Calculate spread if we have all data
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
  console.log('[REFRESH_DONE]', { updated, skipped, wrote });
  
  let buildSha = 'unknown';
  try {
    const { execSync } = require('child_process');
    buildSha = execSync('git rev-parse --short HEAD', { encoding: 'utf-8' }).trim();
  } catch {
    buildSha = process.env.VERCEL_GIT_COMMIT_SHA?.substring(0, 7) || 'unknown';
  }
  
  return NextResponse.json({
    ok: true,
    date: format(today, 'yyyy-MM-dd'),
    updated,
    skipped,
    errors,
    sourceStatus,
    wrote,
    build: buildSha,
    message: updated.length > 0 
      ? `Updated ${updated.length} sources, skipped ${skipped.length}`
      : 'All sources unavailable, using DB data'
  });
}
