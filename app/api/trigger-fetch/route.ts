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
            deltaRegistered: comexData.deltaRegistered,
            deltaEligible: comexData.deltaEligible,
            deltaCombined: comexData.deltaCombined,
            registeredPercent: calculateRegisteredPercent(comexData.totalRegistered, comexData.totalCombined),
          },
          update: {
            totalRegistered: comexData.totalRegistered,
            totalEligible: comexData.totalEligible,
            totalCombined: comexData.totalCombined,
            deltaRegistered: comexData.deltaRegistered,
            deltaEligible: comexData.deltaEligible,
            deltaCombined: comexData.deltaCombined,
            registeredPercent: calculateRegisteredPercent(comexData.totalRegistered, comexData.totalCombined),
          },
        });
        results.comexStock = true;
      }
    } catch (error) {
      errors.push({ source: 'COMEX', message: error instanceof Error ? error.message : String(error) });
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

    // Fetch SGE Price
    let sgePriceData;
    try {
      sgePriceData = await fetchSgePrice(marketDate, fxData?.usdCnyRate);
      if (sgePriceData) {
        await prisma.sgePrice.upsert({
          where: { date: marketDate },
          create: {
            date: marketDate,
            priceCnyPerGram: sgePriceData.priceCnyPerGram,
            priceUsdPerOz: sgePriceData.priceUsdPerOz,
            fxRateUsed: fxData?.usdCnyRate,
          },
          update: {
            priceCnyPerGram: sgePriceData.priceCnyPerGram,
            priceUsdPerOz: sgePriceData.priceUsdPerOz,
            fxRateUsed: fxData?.usdCnyRate,
          },
        });
        results.sgePrice = true;
      }
    } catch (error) {
      errors.push({ source: 'SGE', message: error instanceof Error ? error.message : String(error) });
    }

    // Fetch COMEX Price
    let comexPriceData;
    try {
      comexPriceData = await fetchComexSpotPriceWithRetry(marketDate, 2);
      if (comexPriceData?.priceUsdPerOz > 0) {
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

    // Calculate spread if we have necessary data
    if (sgePriceData && comexPriceData && comexData) {
      try {
        const spread = calculateSpread(
          sgePriceData.priceUsdPerOz,
          comexPriceData.priceUsdPerOz
        );
        
        const psi = calculatePhysicalStressIndex(
          spread.spreadPercent,
          comexData.totalRegistered,
          comexData.totalCombined
        );

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
            registeredPercent: calculateRegisteredPercent(comexData.totalRegistered, comexData.totalCombined),
            psi: psi.value,
            psiStressLevel: psi.level,
          },
          update: {
            sgeUsdPerOz: sgePriceData.priceUsdPerOz,
            comexUsdPerOz: comexPriceData.priceUsdPerOz,
            spreadUsdPerOz: spread.spreadUsdPerOz,
            spreadPercent: spread.spreadPercent,
            registered: comexData.totalRegistered,
            eligible: comexData.totalEligible,
            total: comexData.totalCombined,
            registeredPercent: calculateRegisteredPercent(comexData.totalRegistered, comexData.totalCombined),
            psi: psi.value,
            psiStressLevel: psi.level,
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
