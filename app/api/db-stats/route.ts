import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { jsonResponseNoCache } from '@/lib/headers';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

/**
 * GET /api/db-stats
 * 
 * Liefert live DB-Statistiken für UI Debug-Block
 * Zeigt ob DB wirklich gelesen wird (nicht Cache)
 */
export async function GET() {
  const queryStart = Date.now();
  try {
    // DB Connection Proof
    const dbInfo = await prisma.$queryRaw<any[]>`SELECT current_database() as db, current_schema() as schema, inet_server_addr() as host, version() as version`;
    
    // Metal Prices Stats
    const metalCount = await prisma.metalPrice.count();
    const metalLatest = await prisma.metalPrice.findFirst({
      orderBy: { fetchedAt: 'desc' },
      select: { date: true, fetchedAt: true, xagUsdClose: true, source: true },
    });

    // Retail Prices Stats
    const retailCount = await prisma.retailPrice.count();
    const retailLatest = await prisma.retailPrice.findFirst({
      orderBy: { fetchedAt: 'desc' },
      select: { date: true, fetchedAt: true, provider: true, product: true, priceEur: true },
    });

    // FX Rates Stats
    const fxCount = await prisma.fxRate.count();
    const fxLatest = await prisma.fxRate.findFirst({
      orderBy: { fetchedAt: 'desc' },
      select: { date: true, fetchedAt: true, usdCnyRate: true },
    });

    // SGE Stats
    const sgeCount = await prisma.sgePrice.count();
    const sgeLatest = await prisma.sgePrice.findFirst({
      orderBy: { fetchedAt: 'desc' },
      select: { date: true, fetchedAt: true, priceUsdPerOz: true },
    });

    const queryMs = Date.now() - queryStart;

    // FORENSIC LOG
    console.log('[API /db-stats] DB_QUERY:', {
      db: dbInfo[0],
      tables: ['metal_prices', 'retail_prices', 'fx_rates', 'sge_prices'],
      counts: { metal: metalCount, retail: retailCount, fx: fxCount, sge: sgeCount },
      latestDates: {
        metal: metalLatest?.date.toISOString().split('T')[0],
        retail: retailLatest?.date.toISOString().split('T')[0],
        fx: fxLatest?.date.toISOString().split('T')[0],
        sge: sgeLatest?.date.toISOString().split('T')[0],
      },
      queryMs,
      timestamp: new Date().toISOString(),
    });

    return jsonResponseNoCache({
      timestamp: new Date().toISOString(),
      db: dbInfo[0],
      stats: {
        metal_prices: {
          count: metalCount,
          latest: metalLatest ? {
            date: metalLatest.date.toISOString().split('T')[0],
            price: metalLatest.xagUsdClose,
            source: metalLatest.source,
            fetchedAt: metalLatest.fetchedAt.toISOString(),
          } : null,
        },
        retail_prices: {
          count: retailCount,
          latest: retailLatest ? {
            date: retailLatest.date.toISOString().split('T')[0],
            provider: retailLatest.provider,
            product: retailLatest.product,
            priceEur: retailLatest.priceEur,
            fetchedAt: retailLatest.fetchedAt.toISOString(),
          } : null,
        },
        fx_rates: {
          count: fxCount,
          latest: fxLatest ? {
            date: fxLatest.date.toISOString().split('T')[0],
            rate: fxLatest.usdCnyRate,
            fetchedAt: fxLatest.fetchedAt.toISOString(),
          } : null,
        },
        sge_prices: {
          count: sgeCount,
          latest: sgeLatest ? {
            date: sgeLatest.date.toISOString().split('T')[0],
            price: sgeLatest.priceUsdPerOz,
            fetchedAt: sgeLatest.fetchedAt.toISOString(),
          } : null,
        },
      },
    });
  } catch (error) {
    return jsonResponseNoCache(
      { 
        error: error instanceof Error ? error.message : String(error),
        timestamp: new Date().toISOString(),
      },
      500
    );
  }
}
