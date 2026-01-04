import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { execSync } from 'child_process';

export const dynamic = 'force-dynamic';

export async function GET() {
  let buildSha = 'unknown';
  try {
    buildSha = execSync('git rev-parse --short HEAD', { encoding: 'utf-8' }).trim();
  } catch {
    buildSha = process.env.VERCEL_GIT_COMMIT_SHA?.substring(0, 7) || 'unknown';
  }

  const health: any = {
    build: buildSha,
    timestamp: new Date().toISOString(),
    env: {
      hasCronSecret: !!process.env.CRON_SECRET,
      nodeEnv: process.env.NODE_ENV,
      vercelEnv: process.env.VERCEL_ENV || 'local',
    },
    db: {
      canConnect: false,
      error: null,
    },
    counts: {
      metal_prices: 0,
      retail_prices: 0,
    },
    lastRetail: null,
  };

  try {
    // Test connection
    await prisma.$queryRaw`SELECT 1`;
    health.db.canConnect = true;

    // Counts
    health.counts.metal_prices = await prisma.metalPrice.count();
    health.counts.retail_prices = await prisma.retailPrice.count();

    // Last retail entry
    const lastRetail = await prisma.retailPrice.findFirst({
      orderBy: { fetchedAt: 'desc' },
    });
    
    if (lastRetail) {
      health.lastRetail = {
        date: lastRetail.date.toISOString().split('T')[0],
        provider: lastRetail.provider,
        product: lastRetail.product,
        priceEur: lastRetail.priceEur,
        fetchedAt: lastRetail.fetchedAt.toISOString(),
      };
    }
  } catch (error) {
    health.db.canConnect = false;
    health.db.error = error instanceof Error ? error.message : String(error);
  }

  return NextResponse.json(health, {
    status: health.db.canConnect ? 200 : 500,
  });
}
