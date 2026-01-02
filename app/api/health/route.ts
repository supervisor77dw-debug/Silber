import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  const diagnostics: any = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    env: {
      hasDatabaseUrl: !!process.env.DATABASE_URL,
      hasDirectUrl: !!process.env.DIRECT_URL,
      hasCronSecret: !!process.env.CRON_SECRET,
      nodeEnv: process.env.NODE_ENV,
      databaseUrlPrefix: process.env.DATABASE_URL?.substring(0, 30) + '...',
    },
    database: {
      connected: false,
      tables: [],
      error: null,
    }
  };

  // Test 1: Raw query to check table existence
  try {
    const tables = await prisma.$queryRaw<Array<{tablename: string}>>`
      SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename
    `;
    diagnostics.database.connected = true;
    diagnostics.database.tables = tables.map(t => t.tablename);
  } catch (error) {
    diagnostics.database.error = error instanceof Error ? error.message : String(error);
    diagnostics.status = 'error';
  }

  // Test 2: Try querying daily_spreads
  try {
    const count = await prisma.dailySpread.count();
    diagnostics.database.dailySpreadsCount = count;
  } catch (error) {
    diagnostics.database.dailySpreadsError = error instanceof Error ? error.message : String(error);
  }

  return NextResponse.json(diagnostics, {
    status: diagnostics.status === 'ok' ? 200 : 500
  });
}
