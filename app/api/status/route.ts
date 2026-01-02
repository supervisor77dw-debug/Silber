import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

/**
 * System status endpoint - shows configuration and last fetch attempts
 */
export async function GET() {
  try {
    // Check database connection
    let dbConnected = false;
    let tablesExist = false;
    let recordCounts: any = {};
    
    try {
      await prisma.$connect();
      dbConnected = true;
      
      // Check if tables exist and get counts
      const [
        comexStockCount,
        sgePriceCount,
        fxRateCount,
        comexPriceCount,
        dailySpreadCount,
      ] = await Promise.all([
        prisma.comexStock.count().catch(() => 0),
        prisma.sgePrice.count().catch(() => 0),
        prisma.fxRate.count().catch(() => 0),
        prisma.comexPrice.count().catch(() => 0),
        prisma.dailySpread.count().catch(() => 0),
      ]);
      
      recordCounts = {
        comexStocks: comexStockCount,
        sgePrices: sgePriceCount,
        fxRates: fxRateCount,
        comexPrices: comexPriceCount,
        dailySpreads: dailySpreadCount,
      };
      
      tablesExist = true;
    } catch (error) {
      console.error('Database check failed:', error);
    }

    // Check environment variables
    const envConfig = {
      database: {
        url: process.env.DATABASE_URL ? '✓ Configured' : '✗ Missing',
        directUrl: process.env.DIRECT_URL ? '✓ Configured' : '✗ Missing',
      },
      providers: {
        metalsApi: process.env.METALS_API_KEY ? '✓ Configured' : '✗ Not configured',
        twelveData: process.env.TWELVE_DATA_API_KEY ? '✓ Configured' : '✗ Not configured',
        manualPrice: process.env.SGE_MANUAL_PRICE_CNY_G ? `✓ Set to ${process.env.SGE_MANUAL_PRICE_CNY_G} CNY/g` : '✗ Not set',
      },
      settings: {
        sgePremium: process.env.SGE_PREMIUM_PERCENT || '3 (default)',
        debugPrices: process.env.DEBUG_PRICES === '1' ? '✓ Enabled' : '✗ Disabled',
        cronSecret: process.env.CRON_SECRET ? '✓ Configured' : '✗ Not configured',
      },
    };

    // Get latest fetch attempts (if table exists)
    let latestFetches = null;
    if (tablesExist) {
      try {
        const latest = await prisma.dailySpread.findFirst({
          orderBy: { date: 'desc' },
          select: {
            date: true,
            sgeUsdPerOz: true,
            comexUsdPerOz: true,
            spreadUsdPerOz: true,
            registered: true,
            createdAt: true,
          },
        });
        
        latestFetches = latest ? {
          date: latest.date,
          sgePrice: latest.sgeUsdPerOz,
          comexPrice: latest.comexUsdPerOz,
          spread: latest.spreadUsdPerOz,
          registered: latest.registered,
          createdAt: latest.createdAt,
        } : null;
      } catch (error) {
        console.error('Failed to get latest fetches:', error);
      }
    }

    // System recommendations
    const recommendations: string[] = [];
    
    if (!dbConnected) {
      recommendations.push('⚠ Datenbank-Verbindung fehlgeschlagen - prüfe DATABASE_URL');
    }
    
    if (!tablesExist) {
      recommendations.push('⚠ Tabellen fehlen - führe Prisma-Migrationen aus');
    }
    
    if (envConfig.providers.metalsApi === '✗ Not configured' && 
        envConfig.providers.twelveData === '✗ Not configured' &&
        envConfig.providers.manualPrice === '✗ Not set') {
      recommendations.push('⚠ Keine SGE Provider konfiguriert - setze METALS_API_KEY oder TWELVE_DATA_API_KEY');
      recommendations.push('💡 Alternativ: Setze SGE_MANUAL_PRICE_CNY_G für manuelle Eingabe');
      recommendations.push('💡 Oder: System wird COMEX + 3% Premium verwenden (als Schätzung)');
    }
    
    if (recordCounts.dailySpreads === 0) {
      recommendations.push('ℹ Keine Daten vorhanden - klicke "Ersten Datenabruf durchführen"');
    }

    return NextResponse.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      database: {
        connected: dbConnected,
        tablesExist,
        recordCounts,
      },
      environment: envConfig,
      latestData: latestFetches,
      recommendations,
      endpoints: {
        dashboard: '/api/dashboard',
        triggerFetch: '/api/trigger-fetch (POST)',
        debugPrices: '/api/debug/prices (requires DEBUG_PRICES=1)',
        health: '/api/health',
      },
    });

  } catch (error) {
    return NextResponse.json({
      status: 'error',
      error: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString(),
    }, { status: 500 });
  }
}
