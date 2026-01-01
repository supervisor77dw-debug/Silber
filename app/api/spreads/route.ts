import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { startOfDay, endOfDay, subDays } from 'date-fns';

export async function GET(request: Request) {
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
    
    return NextResponse.json(spreads);
  } catch (error) {
    console.error('Error fetching spreads:', error);
    return NextResponse.json(
      { error: 'Failed to fetch spreads' },
      { status: 500 }
    );
  }
}
