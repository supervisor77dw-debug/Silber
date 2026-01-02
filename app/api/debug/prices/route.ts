import { NextResponse } from 'next/server';
import { fetchSgePriceWithProviders } from '@/lib/providers/sgePriceProvider';
import { fetchFxRateWithRetry } from '@/lib/fetchers/fx';
import { fetchComexSpotPriceWithRetry } from '@/lib/fetchers/comex-price';
import { startOfDay } from 'date-fns';

export const dynamic = 'force-dynamic';

/**
 * Debug endpoint to diagnose SGE price fetching
 * Shows raw data, conversion steps, and validation results
 * 
 * Only enabled when DEBUG_PRICES=1 in environment
 */
export async function GET() {
  // Security: Only enable in debug mode
  if (process.env.DEBUG_PRICES !== '1') {
    return NextResponse.json(
      { error: 'Debug endpoint disabled. Set DEBUG_PRICES=1 to enable.' },
      { status: 403 }
    );
  }

  try {
    const marketDate = startOfDay(new Date());
    
    // Step 1: Fetch FX Rate
    console.log('[Debug] Fetching FX rate...');
    const fxData = await fetchFxRateWithRetry(marketDate, 2);
    
    if (!fxData) {
      return NextResponse.json({
        error: 'FX rate not available',
        step: 'fx-fetch',
      }, { status: 500 });
    }

    // Step 2: Fetch COMEX price (optional, for Provider D)
    console.log('[Debug] Fetching COMEX price...');
    const comexData = await fetchComexSpotPriceWithRetry(marketDate, 2);

    // Step 3: Fetch SGE price with full debug info
    console.log('[Debug] Fetching SGE price with providers...');
    const sgeResult = await fetchSgePriceWithProviders(
      marketDate,
      fxData.usdCnyRate,
      comexData?.priceUsdPerOz
    );

    if (!sgeResult) {
      return NextResponse.json({
        error: 'All SGE providers failed',
        fxRate: {
          usdCnyRate: fxData.usdCnyRate,
          source: fxData.source,
        },
        comexPrice: comexData ? {
          priceUsdPerOz: comexData.priceUsdPerOz,
          contract: comexData.contract,
        } : null,
        providers: {
          metalsApi: process.env.METALS_API_KEY ? 'Configured' : 'Not configured',
          twelveData: process.env.TWELVE_DATA_API_KEY ? 'Configured' : 'Not configured',
          manualPrice: process.env.SGE_MANUAL_PRICE_CNY_G ? 'Configured' : 'Not configured',
          sgePremium: process.env.SGE_PREMIUM_PERCENT || '3% (default)',
        },
      }, { status: 500 });
    }

    // Return full debug information
    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      marketDate: marketDate.toISOString(),
      
      // Final result
      result: {
        priceUsdPerOz: sgeResult.priceUsdPerOz,
        priceCnyPerGram: sgeResult.priceCnyPerGram,
        source: sgeResult.source,
        isEstimated: sgeResult.isEstimated,
      },
      
      // Input data
      inputs: {
        fxRate: {
          usdCnyRate: fxData.usdCnyRate,
          source: fxData.source,
        },
        comexPrice: comexData ? {
          priceUsdPerOz: comexData.priceUsdPerOz,
          contract: comexData.contract,
        } : null,
      },
      
      // Conversion steps (detailed calculation)
      conversionSteps: sgeResult.conversionSteps,
      
      // Raw data from provider
      rawData: {
        price: sgeResult.rawData.price,
        currency: sgeResult.rawData.currency,
        unit: sgeResult.rawData.unit,
        source: sgeResult.rawData.source,
        timestamp: sgeResult.rawData.timestamp,
        symbol: sgeResult.rawData.symbol,
        // Omit full rawResponse to avoid leaking sensitive data
      },
      
      // Environment configuration
      config: {
        providers: {
          metalsApi: process.env.METALS_API_KEY ? 'Configured (key hidden)' : 'Not configured',
          twelveData: process.env.TWELVE_DATA_API_KEY ? 'Configured (key hidden)' : 'Not configured',
          manualPrice: process.env.SGE_MANUAL_PRICE_CNY_G || 'Not configured',
        },
        validation: {
          minPrice: process.env.SILVER_MIN_PRICE || '10 (default)',
          maxPrice: process.env.SILVER_MAX_PRICE || '200 (default)',
        },
        premium: {
          sgePremium: process.env.SGE_PREMIUM_PERCENT || '3% (default)',
        },
      },
    });

  } catch (error) {
    console.error('[Debug] Error:', error);
    return NextResponse.json({
      error: 'Debug endpoint error',
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    }, { status: 500 });
  }
}
