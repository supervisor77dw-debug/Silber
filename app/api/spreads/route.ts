import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { startOfDay, endOfDay, subDays } from 'date-fns';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request: Request) {
  const queryStart = Date.now();
  try {
    const { searchParams } = new URL(request.url);
    const days = parseInt(searchParams.get('days') || '30');
    const startDateParam = searchParams.get('startDate');
    const endDateParam = searchParams.get('endDate');
    
    let startDate: Date;
    let endDate: Date = endOfDay(new Date());
    
    if (startDateParam && endDateParam) {
      startDate = startOfDay(new Date(startDateParam));
      endDate = endOfDay(new Date(endDateParam));
    } else {
      startDate = startOfDay(subDays(new Date(), days));
    }

    // DB Connection Proof
    const dbInfo = await prisma.$queryRaw<any[]>`SELECT current_database() as db, current_schema() as schema, inet_server_addr() as host`;
    
    const spreads = await prisma.dailySpread.findMany({
      where: {
        date: {
          gte: startDate,
          lte: endDate,
        },
      },
      orderBy: {
        date: 'asc',
      },
    });

    const minDate = spreads.length > 0 ? spreads[0].date.toISOString().split('T')[0] : null;
    const maxDate = spreads.length > 0 ? spreads[spreads.length - 1].date.toISOString().split('T')[0] : null;
    const queryMs = Date.now() - queryStart;

    // FORENSIC LOG
    console.log('[API /spreads] DB_QUERY:', {
      table: 'daily_spreads',
      db: dbInfo[0],
      where: `date >= '${startDate.toISOString().split('T')[0]}' AND date <= '${endDate.toISOString().split('T')[0]}'`,
      orderBy: 'date ASC',
      rowCount: spreads.length,
      minDate,
      maxDate,
      queryMs,
      timestamp: new Date().toISOString(),
    });
    
    return NextResponse.json(spreads, {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
      },
    });
  } catch (error) {
    console.error('Error fetching spreads:', error);
    return NextResponse.json(
      { error: 'Failed to fetch spreads' },
      { status: 500 }
    );
  }
}
