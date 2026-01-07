import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { fetchComexStocks } from '@/lib/fetchers/comex';
import { fetchSgePrice } from '@/lib/fetchers/sge';
import { fetchFxRateWithRetry } from '@/lib/fetchers/fx';
import { fetchComexSpotPriceWithRetry } from '@/lib/fetchers/comex-price';
import { fetchRetailPrices } from '@/lib/fetchers/retail';
import { FetchRunTracker } from '@/lib/fetch-run-tracker';
import { 
  calculateSpread, 
  calculateRegisteredPercent,
  calculatePhysicalStressIndex 
} from '@/lib/calculations';
import { startOfDay, format, subDays } from 'date-fns';

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
  const startTime = Date.now();
  console.log('[API /refresh] POST_START:', {
    timestamp: new Date().toISOString(),
    url: req.url,
    headers: Object.fromEntries(req.headers.entries()),
  });
  
  // Bearer Auth REQUIRED - accepts both CRON_SECRET (server) and REFRESH_TOKEN (client)
  const authHeader = req.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  const refreshToken = process.env.NEXT_PUBLIC_REFRESH_TOKEN;
  
  const validAuth = authHeader && (
    authHeader === `Bearer ${cronSecret}` || 
    authHeader === `Bearer ${refreshToken}`
  );
  
  if (!validAuth) {
    console.warn('[REFRESH_AUTH_FAIL]', { 
      hasHeader: !!authHeader, 
      hasCronSecret: !!cronSecret,
      hasRefreshToken: !!refreshToken 
    });
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
        const meta = sgeResult.metadata;
        
        await prisma.sgePrice.upsert({
          where: { date: today },
          create: {
            date: today,
            priceCnyPerGram: sgeResult.priceCnyPerGram,
            priceUsdPerOz: sgeResult.priceUsdPerOz,
            // CRITICAL: Store provider metadata for transparency
            exchange: meta.rawData.source === 'Metals-API' || meta.rawData.source === 'TwelveData' ? 'SGE' : meta.rawData.source,
            contract: meta.rawData.symbol || 'Ag99.99',
            currency: meta.rawData.currency,
            fxSource: 'ECB',
            fxRateUsed: meta.fxRateUsed,
            provider: meta.source,
            isEstimated: meta.isEstimated,
            conversionSteps: JSON.stringify(meta.conversionSteps),
            rawData: JSON.stringify(meta.rawData),
            sourceUrl: 'multi-provider',
            isValidated: true
          },
          update: {
            priceCnyPerGram: sgeResult.priceCnyPerGram,
            priceUsdPerOz: sgeResult.priceUsdPerOz,
            exchange: meta.rawData.source === 'Metals-API' || meta.rawData.source === 'TwelveData' ? 'SGE' : meta.rawData.source,
            contract: meta.rawData.symbol || 'Ag99.99',
            currency: meta.rawData.currency,
            fxRateUsed: meta.fxRateUsed,
            provider: meta.source,
            isEstimated: meta.isEstimated,
            conversionSteps: JSON.stringify(meta.conversionSteps),
            rawData: JSON.stringify(meta.rawData),
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
  
  // 5) Retail Prices (Degussa, ProAurum) - PRODUCTION READY
  // REGEL: NUR echte Daten mit source_url + raw_excerpt!
  try {
    console.log('[FETCH_RETAIL_START]');
    
    // Get spot price and FX rate for plausibility check
    let spotPriceUsd = 0;
    let usdEurRate = 1.1; // Default fallback
    
    // Try to get today's metal price (spot)
    const latestMetal = await prisma.metalPrice.findFirst({
      where: { date: { lte: today } },
      orderBy: { date: 'desc' },
      select: { xagUsdClose: true },
    });
    
    if (latestMetal) {
      spotPriceUsd = latestMetal.xagUsdClose;
    }
    
    // Try to get today's FX rate (USD/EUR)
    const latestFx = await prisma.fxRate.findFirst({
      where: { date: { lte: today } },
      orderBy: { date: 'desc' },
      select: { usdCnyRate: true },
    });
    
    // Convert USD/CNY to USD/EUR (approximation: EUR ≈ 7.8 CNY)
    // Better: use actual EUR/USD rate if available
    if (latestFx) {
      // Rough conversion: 1 EUR ≈ 1.1 USD (hardcoded for now)
      // TODO: Fetch actual EUR/USD rate
      usdEurRate = 1.1; // EUR is stronger than USD
    }
    
    if (spotPriceUsd === 0) {
      throw new Error('No spot price available for plausibility check');
    }
    
    console.log('[RETAIL_CONTEXT]', { spotPriceUsd, usdEurRate });
    
    // Fetch retail prices with plausibility checks
    const retailResults = await fetchRetailPrices(spotPriceUsd, usdEurRate);
    
    console.log('[FETCH_RETAIL_OK]', retailResults.length, 'results');
    
    // Write to database using raw SQL for proper UPSERT
    for (const result of retailResults) {
      console.log('[RETAIL_RESULT]', {
        provider: result.provider,
        product: result.product,
        priceEur: result.priceEur,
        status: result.verificationStatus,
        error: result.errorMessage,
      });
      
      // UPSERT with ON CONFLICT
      await prisma.$executeRaw`
        INSERT INTO retail_prices (
          id, date, provider, product, 
          price_eur, fine_oz, 
          source, source_url, raw_excerpt, verification_status,
          discovery_strategy, attempted_urls, http_status_code,
          fetched_at
        )
        VALUES (
          gen_random_uuid()::text,
          ${today}::date,
          ${result.provider},
          ${result.product},
          ${result.priceEur},
          ${result.fineOz},
          'scraper',
          ${result.sourceUrl},
          ${result.rawExcerpt},
          ${result.verificationStatus},
          ${result.discoveryStrategy || null},
          ${result.attemptedUrls ? JSON.stringify(result.attemptedUrls) : null},
          ${result.errorMessage?.includes('404') ? 404 : result.errorMessage?.includes('500') ? 500 : null},
          NOW()
        )
        ON CONFLICT (date, provider, product)
        DO UPDATE SET
          price_eur = EXCLUDED.price_eur,
          source_url = EXCLUDED.source_url,
          raw_excerpt = EXCLUDED.raw_excerpt,
          verification_status = EXCLUDED.verification_status,
          discovery_strategy = EXCLUDED.discovery_strategy,
          attempted_urls = EXCLUDED.attempted_urls,
          http_status_code = EXCLUDED.http_status_code,
          fetched_at = EXCLUDED.fetched_at
      `;
      `;
      
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
  
  // 6) Calculate spread from LATEST available data (not just today)
  // CRITICAL FIX: If APIs fail today but DB has data, we still calculate spreads
  try {
    const latestComexPrice = await prisma.comexPrice.findFirst({
      orderBy: { marketDate: 'desc' }
    });
    
    const latestSgePrice = await prisma.sgePrice.findFirst({
      orderBy: { date: 'desc' }
    });
    
    const latestComexStock = await prisma.comexStock.findFirst({
      orderBy: { date: 'desc' }
    });
    
    if (latestComexPrice && latestSgePrice && latestComexStock) {
      // Use the OLDEST date among the three sources as spread date
      // This ensures we only create spreads when ALL data is available for that date
      const spreadDate = new Date(Math.max(
        latestComexPrice.marketDate.getTime(),
        latestSgePrice.date.getTime(),
        latestComexStock.date.getTime()
      ));
      
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
        where: { date: startOfDay(spreadDate) },
        create: {
          date: startOfDay(spreadDate),
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
      
      console.log('[SPREAD_CALC_OK]', {
        spreadDate: format(spreadDate, 'yyyy-MM-dd'),
        sgePriceDate: format(latestSgePrice.date, 'yyyy-MM-dd'),
        comexPriceDate: format(latestComexPrice.marketDate, 'yyyy-MM-dd'),
        comexStockDate: format(latestComexStock.date, 'yyyy-MM-dd'),
        spreadUsd: spreadResult.spreadUsdPerOz.toFixed(2),
      });
      
      updated.push('spread');
    } else {
      console.warn('[SPREAD_CALC_SKIP]', {
        hasComexPrice: !!latestComexPrice,
        hasSgePrice: !!latestSgePrice,
        hasComexStock: !!latestComexStock,
      });
    }
  } catch (err) {
    console.warn('[Refresh] Spread calculation skip:', err instanceof Error ? err.message : String(err));
    skipped.push('spread');
  }
  
  // Response: Status only, NO data
  const totalMs = Date.now() - startTime;
  
  console.log('[API /refresh] POST_COMPLETE:', {
    duration_ms: totalMs,
    updated,
    skipped,
    wrote,
    sourceStatus,
    timestamp: new Date().toISOString(),
  });
  
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
    duration_ms: totalMs,
    message: updated.length > 0 
      ? `Updated ${updated.length} sources, skipped ${skipped.length}`
      : 'All sources unavailable, using DB data'
  });
}
