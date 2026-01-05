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
  try {
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

    return jsonResponseNoCache({
      timestamp: new Date().toISOString(),
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
