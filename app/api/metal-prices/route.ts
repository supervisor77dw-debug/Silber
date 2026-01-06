import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { subDays, startOfDay } from 'date-fns';
import { jsonResponseNoCache } from '@/lib/headers';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

/**
 * GET /api/metal-prices?days=30
 * 
 * Returns historical metal prices from backfill/live data
 * Used for Chart History visualization
 */
export async function GET(req: NextRequest) {
  const queryStart = Date.now();
  try {
    const { searchParams } = new URL(req.url);
    const days = parseInt(searchParams.get('days') || '30', 10);
    
    const startDate = startOfDay(subDays(new Date(), days));

    // DB Connection Proof
    const dbInfo = await prisma.$queryRaw<any[]>`SELECT current_database() as db, current_schema() as schema, inet_server_addr() as host`;
    
    const prices = await prisma.metalPrice.findMany({
      where: {
        date: {
          gte: startDate,
        },
      },
      orderBy: {
        date: 'asc',
      },
      select: {
        date: true,
        xagUsdClose: true,
        xagUsdOpen: true,
        xagUsdHigh: true,
        xagUsdLow: true,
        volume: true,
        source: true,
        fetchedAt: true,
      },
    });

    const minDate = prices.length > 0 ? prices[0].date.toISOString().split('T')[0] : null;
    const maxDate = prices.length > 0 ? prices[prices.length - 1].date.toISOString().split('T')[0] : null;
    const queryMs = Date.now() - queryStart;

    // FORENSIC LOG
    console.log('[API /metal-prices] DB_QUERY:', {
      table: 'metal_prices',
      db: dbInfo[0],
      where: `date >= '${startDate.toISOString().split('T')[0]}'`,
      orderBy: 'date ASC',
      rowCount: prices.length,
      minDate,
      maxDate,
      queryMs,
      timestamp: new Date().toISOString(),
    });

    return jsonResponseNoCache({
      ok: true,
      count: prices.length,
      dateRange: {
        from: startDate.toISOString().split('T')[0],
        to: new Date().toISOString().split('T')[0],
        requestedDays: days,
      },
      prices: prices.map(p => ({
        date: p.date.toISOString().split('T')[0],
        xagUsdClose: Number(p.xagUsdClose),
        xagUsdOpen: p.xagUsdOpen ? Number(p.xagUsdOpen) : null,
        xagUsdHigh: p.xagUsdHigh ? Number(p.xagUsdHigh) : null,
        xagUsdLow: p.xagUsdLow ? Number(p.xagUsdLow) : null,
        volume: p.volume ? Number(p.volume) : null,
        source: p.source,
        fetchedAt: p.fetchedAt.toISOString(),
      })),
    });
  } catch (error) {
    console.error('[Metal Prices API Error]:', error);
    return jsonResponseNoCache(
      { 
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      },
      500
    );
  }
}
