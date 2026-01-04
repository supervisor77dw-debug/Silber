import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

/**
 * GET /api/retail-prices
 * 
 * Returns latest retail prices per provider/product
 * Uses DISTINCT ON to get only newest entry per combination
 */
export async function GET() {
  try {
    // Get latest retail prices - one per provider/product combo
    const latestPrices = await prisma.$queryRaw<any[]>`
      SELECT DISTINCT ON (provider, product)
        date,
        provider,
        product,
        price_eur as "priceEur",
        fine_oz as "fineOz",
        implied_usd_oz as "impliedUsdOz",
        premium_percent as "premiumPercent",
        fetched_at as "fetchedAt"
      FROM retail_prices
      ORDER BY provider, product, date DESC, fetched_at DESC
    `;

    return NextResponse.json({
      ok: true,
      count: latestPrices.length,
      prices: latestPrices.map(p => ({
        date: p.date.toISOString().split('T')[0],
        provider: p.provider,
        product: p.product,
        priceEur: Number(p.priceEur),
        fineOz: Number(p.fineOz),
        impliedUsdOz: p.impliedUsdOz ? Number(p.impliedUsdOz) : null,
        premiumPercent: p.premiumPercent ? Number(p.premiumPercent) : null,
        fetchedAt: p.fetchedAt.toISOString(),
      })),
    });
  } catch (error) {
    console.error('[Retail Prices API Error]:', error);
    return NextResponse.json(
      { 
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
