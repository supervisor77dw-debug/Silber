import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { fetchComexStocks } from '@/lib/fetchers/comex';
import { fetchFxRateWithRetry } from '@/lib/fetchers/fx';
import { fetchSgePrice } from '@/lib/fetchers/sge';
import { fetchComexSpotPriceWithRetry } from '@/lib/fetchers/comex-price';
import { 
  calculateDailyChanges, 
  calculateSpread, 
  calculateRegisteredPercent,
  calculatePhysicalStressIndex,
  isExtremeValue,
  calculateZScore
} from '@/lib/calculations';
import { format, startOfDay } from 'date-fns';

export const dynamic = 'force-dynamic';
export const maxDuration = 60; // 60 seconds for Vercel

/**
 * Production-hardened data fetcher with:
 * - Idempotency (upsert by market_date)
 * - UTC timezone normalization
 * - Comprehensive error codes
 * - PSI calculation
 * - Partial success handling
 */
export async function POST(request: Request) {
  const startTime = Date.now();
  
  try {
    // Verify cron secret if configured
    const authHeader = request.headers.get('authorization');
    if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Parse request body for optional date override (for backfill)
    let targetDate: Date;
    try {
      const body = await request.json();
      targetDate = body.date ? new Date(body.date) : new Date();
    } catch {
      targetDate = new Date();
    }
    
    // Normalize to start of day in UTC to avoid timezone issues
    const marketDate = startOfDay(targetDate);
    const dateStr = format(marketDate, 'yyyy-MM-dd');
    
    console.log(`\n═══ Starting data fetch for ${dateStr} (UTC) ═══`);
    
    const results = {
      comex: false,
      fx: false,
      sge: false,
      comexPrice: false,
      spread: false,
      psi: false,
    };
    
    const errors: { source: string; code: string; message: string }[] = [];
    
    // === STEP 1: Fetch FX Rate ===
    let fxData;
    try {
      console.log('\n[1/5] Fetching FX rate (USD/CNY)...');
      fxData = await fetchFxRateWithRetry(marketDate, 3);
      
      if (fxData && fxData.usdCnyRate > 0) {
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
            fetchedAt: new Date(),
          },
        });
        
        results.fx = true;
        console.log(`✓ FX: ${fxData.usdCnyRate.toFixed(4)} from ${fxData.source}`);
      } else {
        errors.push({ source: 'FX', code: 'NO_DATA', message: 'No FX rate returned' });
      }
    } catch (error) {
      console.error('✗ FX fetch error:', error);
      errors.push({ 
        source: 'FX', 
        code: 'FETCH_ERROR', 
        message: error instanceof Error ? error.message : 'Unknown error' 
      });
    }
    
    // === STEP 2: Fetch COMEX Stocks ===
    let comexData;
    try {
      console.log('\n[2/5] Fetching COMEX silver stocks...');
      comexData = await fetchComexStocks(marketDate);
      
      if (comexData) {
        const { deltaRegistered, deltaEligible, deltaCombined } = 
          await calculateDailyChanges(marketDate, comexData);
        
        const registeredPercent = calculateRegisteredPercent(
          comexData.totalRegistered, 
          comexData.totalCombined
        );
        
        const stock = await prisma.comexStock.upsert({
          where: { date: marketDate },
          create: {
            date: marketDate,
            totalRegistered: comexData.totalRegistered,
            totalEligible: comexData.totalEligible,
            totalCombined: comexData.totalCombined,
            deltaRegistered,
            deltaEligible,
            deltaCombined,
            registeredPercent,
            isValidated: true,
            fetchedAt: new Date(),
          },
          update: {
            totalRegistered: comexData.totalRegistered,
            totalEligible: comexData.totalEligible,
            totalCombined: comexData.totalCombined,
            deltaRegistered,
            deltaEligible,
            deltaCombined,
            registeredPercent,
            fetchedAt: new Date(),
          },
        });
        
        // Save warehouse details if available (delete-then-insert for idempotency)
        if (comexData.warehouses && comexData.warehouses.length > 0) {
          await prisma.comexWarehouse.deleteMany({
            where: { stockId: stock.id },
          });
          
          await prisma.comexWarehouse.createMany({
            data: comexData.warehouses.map(wh => ({
              stockId: stock.id,
              warehouseName: wh.warehouseName,
              registered: wh.registered,
              eligible: wh.eligible,
              deposits: wh.deposits,
              withdrawals: wh.withdrawals,
              adjustments: wh.adjustments,
            })),
          });
        }
        
        results.comex = true;
        console.log(`✓ COMEX: ${comexData.totalCombined.toLocaleString()} oz total (${registeredPercent.toFixed(1)}% registered)`);
      } else {
        errors.push({ source: 'COMEX', code: 'NO_DATA', message: 'No COMEX stocks returned' });
      }
    } catch (error) {
      console.error('✗ COMEX fetch error:', error);
      errors.push({ 
        source: 'COMEX', 
        code: 'FETCH_ERROR', 
        message: error instanceof Error ? error.message : 'Unknown error' 
      });
    }
    
    // === STEP 3: Fetch COMEX Spot Price ===
    let comexPriceData;
    try {
      console.log('\n[3/5] Fetching COMEX spot price...');
      comexPriceData = await fetchComexSpotPriceWithRetry(marketDate, 2);
      
      if (comexPriceData && comexPriceData.priceUsdPerOz > 0) {
        await prisma.comexPrice.upsert({
          where: { date: marketDate },
          create: {
            date: marketDate,
            priceUsdPerOz: comexPriceData.priceUsdPerOz,
            contract: comexPriceData.contract,
            fetchedAt: new Date(),
          },
          update: {
            priceUsdPerOz: comexPriceData.priceUsdPerOz,
            contract: comexPriceData.contract,
            fetchedAt: new Date(),
          },
        });
        
        results.comexPrice = true;
        console.log(`✓ COMEX Price: $${comexPriceData.priceUsdPerOz.toFixed(2)}/oz (${comexPriceData.contract})`);
      } else {
        errors.push({ source: 'COMEX_PRICE', code: 'NO_DATA', message: 'No COMEX price returned' });
      }
    } catch (error) {
      console.error('✗ COMEX price fetch error:', error);
      errors.push({ 
        source: 'COMEX_PRICE', 
        code: 'FETCH_ERROR', 
        message: error instanceof Error ? error.message : 'Unknown error' 
      });
    }
    
    // === STEP 4: Fetch SGE Price ===
    let sgePriceData;
    if (fxData && fxData.usdCnyRate > 0) {
      try {
        console.log('\n[4/5] Fetching SGE benchmark price...');
        sgePriceData = await fetchSgePrice(marketDate, fxData.usdCnyRate);
        
        if (sgePriceData && sgePriceData.priceUsdPerOz > 0) {
          await prisma.sgePrice.upsert({
            where: { date: marketDate },
            create: {
              date: marketDate,
              priceCnyPerGram: sgePriceData.priceCnyPerGram,
              priceUsdPerOz: sgePriceData.priceUsdPerOz,
              fetchedAt: new Date(),
            },
            update: {
              priceCnyPerGram: sgePriceData.priceCnyPerGram,
              priceUsdPerOz: sgePriceData.priceUsdPerOz,
              fetchedAt: new Date(),
            },
          });
          
          results.sge = true;
          console.log(`✓ SGE: $${sgePriceData.priceUsdPerOz.toFixed(2)}/oz (${sgePriceData.priceCnyPerGram.toFixed(2)} CNY/g)`);
        } else {
          errors.push({ source: 'SGE', code: 'NO_DATA', message: 'No SGE price returned' });
        }
      } catch (error) {
        console.error('✗ SGE fetch error:', error);
        errors.push({ 
          source: 'SGE', 
          code: 'FETCH_ERROR', 
          message: error instanceof Error ? error.message : 'Unknown error' 
        });
      }
    } else {
      errors.push({ source: 'SGE', code: 'DEPENDENCY_FAILED', message: 'FX rate required but unavailable' });
    }
    
    // === STEP 5: Calculate Spread + PSI ===
    if (sgePriceData && comexPriceData && comexData) {
      try {
        console.log('\n[5/5] Calculating spread and PSI...');
        
        const { spreadUsdPerOz, spreadPercent } = calculateSpread(
          sgePriceData.priceUsdPerOz,
          comexPriceData.priceUsdPerOz
        );
        
        const registeredPercent = calculateRegisteredPercent(
          comexData.totalRegistered,
          comexData.totalCombined
        );
        
        // Calculate PSI
        const psiResult = calculatePhysicalStressIndex({
          spreadUsdPerOz,
          totalRegistered: comexData.totalRegistered,
          totalCombined: comexData.totalCombined,
        });
        
        const isExtreme = await isExtremeValue(spreadUsdPerOz, 'spread');
        const zScore = await calculateZScore(spreadUsdPerOz, 'spread');
        
        await prisma.dailySpread.upsert({
          where: { date: marketDate },
          create: {
            date: marketDate,
            sgeUsdPerOz: sgePriceData.priceUsdPerOz,
            comexUsdPerOz: comexPriceData.priceUsdPerOz,
            spreadUsdPerOz,
            spreadPercent,
            registered: comexData.totalRegistered,
            eligible: comexData.totalEligible,
            total: comexData.totalCombined,
            registeredPercent,
            isExtreme,
            zScore,
          },
          update: {
            sgeUsdPerOz: sgePriceData.priceUsdPerOz,
            comexUsdPerOz: comexPriceData.priceUsdPerOz,
            spreadUsdPerOz,
            spreadPercent,
            registered: comexData.totalRegistered,
            eligible: comexData.totalEligible,
            total: comexData.totalCombined,
            registeredPercent,
            isExtreme,
            zScore,
          },
        });
        
        results.spread = true;
        results.psi = psiResult.psi !== null;
        
        console.log(`✓ Spread: $${spreadUsdPerOz.toFixed(2)}/oz (${spreadPercent.toFixed(2)}%)`);
        if (psiResult.psi !== null) {
          console.log(`✓ PSI: ${psiResult.psi.toFixed(2)} [${psiResult.stressLevel}]`);
        }
      } catch (error) {
        console.error('✗ Spread calculation error:', error);
        errors.push({ 
          source: 'SPREAD', 
          code: 'CALC_ERROR', 
          message: error instanceof Error ? error.message : 'Unknown error' 
        });
      }
    } else {
      const missing = [];
      if (!sgePriceData) missing.push('SGE price');
      if (!comexPriceData) missing.push('COMEX price');
      if (!comexData) missing.push('COMEX stocks');
      
      errors.push({ 
        source: 'SPREAD', 
        code: 'DEPENDENCY_FAILED', 
        message: `Missing: ${missing.join(', ')}` 
      });
    }
    
    // === Log fetch status ===
    const duration = Date.now() - startTime;
    const status = errors.length === 0 ? 'success' : 
                   Object.values(results).some(v => v) ? 'partial' : 'failed';
    
    await prisma.fetchLog.create({
      data: {
        date: marketDate,
        source: 'ALL',
        status,
        errorMsg: errors.length > 0 ? JSON.stringify(errors) : null,
      },
    });
    
    console.log(`\n═══ Fetch completed in ${duration}ms - Status: ${status.toUpperCase()} ═══\n`);
    
    return NextResponse.json({
      success: errors.length === 0,
      date: dateStr,
      results,
      duration,
      errors: errors.length > 0 ? errors : undefined,
    });
    
  } catch (error) {
    console.error('✗ FATAL: Fetch cron error:', error);
    
    return NextResponse.json(
      { 
        error: 'Internal server error',
        code: 'FATAL_ERROR',
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

/**
 * GET endpoint - Information about this cron job
 */
export async function GET() {
  return NextResponse.json({ 
    message: 'Use POST to trigger data fetch',
    endpoint: '/api/cron/fetch-data',
    usage: 'POST with optional body: { "date": "2025-01-15" } for backfill'
  });
}


