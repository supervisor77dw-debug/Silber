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

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Public endpoint for manual data fetch trigger
 * Executes the same logic as the cron job without auth requirement
 */
export async function POST() {
  try {
    const marketDate = startOfDay(new Date());
    
    const results = {
      comexStock: false,
      sgePrice: false,
      fxRate: false,
      comexPrice: false,
      spread: false,
    };

    const errors: any[] = [];

    // Fetch COMEX data
    let comexData;
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
        results.comexStock = true;
      } else {
        // Fallback: Use last known values if current fetch fails
        const lastStock = await prisma.comexStock.findFirst({
          orderBy: { date: 'desc' },
        });
        
        if (lastStock) {
          console.log('⚠ COMEX stocks unavailable, using last known values');
          comexData = {
            date: marketDate,
            totalRegistered: lastStock.totalRegistered,
            totalEligible: lastStock.totalEligible,
            totalCombined: lastStock.totalCombined,
          };
          errors.push({ source: 'COMEX', message: 'Using last known values (current data unavailable)' });
        } else if (process.env.COMEX_FALLBACK_REGISTERED) {
          // Use environment variable fallback
          const fallbackRegistered = parseFloat(process.env.COMEX_FALLBACK_REGISTERED);
          const fallbackEligible = parseFloat(process.env.COMEX_FALLBACK_ELIGIBLE || '0');
          
          console.log('⚠ COMEX stocks unavailable, using fallback values from ENV');
          comexData = {
            date: marketDate,
            totalRegistered: fallbackRegistered,
            totalEligible: fallbackEligible,
            totalCombined: fallbackRegistered + fallbackEligible,
          };
          errors.push({ source: 'COMEX', message: 'Using fallback values from ENV (current data unavailable)' });
        } else {
          // Use reasonable default values (typical COMEX silver inventory levels)
          console.log('⚠ COMEX stocks unavailable, using default fallback values');
          const defaultRegistered = 50000000; // 50M oz - typical registered inventory
          const defaultEligible = 250000000;   // 250M oz - typical eligible inventory
          
          comexData = {
            date: marketDate,
            totalRegistered: defaultRegistered,
            totalEligible: defaultEligible,
            totalCombined: defaultRegistered + defaultEligible,
          };
          errors.push({ 
            source: 'COMEX', 
            message: 'Using default fallback values (current data unavailable, no DB history). Set COMEX_FALLBACK_REGISTERED/ELIGIBLE in ENV for custom values.' 
          });
        }
      }
    } catch (error) {
      errors.push({ source: 'COMEX', message: error instanceof Error ? error.message : String(error) });
      
      // Try fallback even on error
      try {
        const lastStock = await prisma.comexStock.findFirst({
          orderBy: { date: 'desc' },
        });
        
        if (lastStock) {
          console.log('⚠ COMEX error, using last known values');
          comexData = {
            date: marketDate,
            totalRegistered: lastStock.totalRegistered,
            totalEligible: lastStock.totalEligible,
            totalCombined: lastStock.totalCombined,
          };
        }
      } catch (fallbackError) {
        console.error('Fallback also failed:', fallbackError);
      }
    }

    // Fetch FX Rate
    let fxData;
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
        results.fxRate = true;
      }
    } catch (error) {
      errors.push({ source: 'FX', message: error instanceof Error ? error.message : String(error) });
    }

    // Fetch COMEX Price (fetch before SGE to enable Provider D fallback)
    let comexPriceData;
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
        results.comexPrice = true;
      }
    } catch (error) {
      errors.push({ source: 'COMEX_PRICE', message: error instanceof Error ? error.message : String(error) });
    }

    // Fetch SGE Price (only if we have FX rate, pass COMEX price for fallback)
    let sgePriceData;
    if (fxData?.usdCnyRate) {
      try {
        sgePriceData = await fetchSgePrice(
          marketDate, 
          fxData.usdCnyRate,
          comexPriceData?.priceUsdPerOz
        );
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
          results.sgePrice = true;
        }
      } catch (error) {
        errors.push({ source: 'SGE', message: error instanceof Error ? error.message : String(error) });
      }
    } else {
      errors.push({ source: 'SGE', message: 'Skipped - FX rate not available' });
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
        results.spread = true;
      } catch (error) {
        errors.push({ source: 'SPREAD', message: error instanceof Error ? error.message : String(error) });
      }
    }

    return NextResponse.json({
      success: true,
      results,
      errors: errors.length > 0 ? errors : undefined,
      date: marketDate.toISOString(),
    });

  } catch (error) {
    console.error('Manual trigger error:', error);
    return NextResponse.json(
      { 
        success: false,
        error: 'Failed to trigger data fetch',
        details: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    );
  }
}
