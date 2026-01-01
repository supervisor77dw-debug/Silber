import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { format } from 'date-fns';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const days = parseInt(searchParams.get('days') || '90');
    
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    
    const spreads = await prisma.dailySpread.findMany({
      where: {
        date: {
          gte: startDate,
        },
      },
      orderBy: {
        date: 'asc',
      },
    });
    
    // Convert to CSV
    const headers = [
      'Date',
      'SGE Price (USD/oz)',
      'COMEX Price (USD/oz)',
      'Spread (USD/oz)',
      'Spread (%)',
      'Registered (oz)',
      'Eligible (oz)',
      'Total (oz)',
      'Registered %',
      'Is Extreme',
      'Z-Score',
    ].join(',');
    
    const rows = spreads.map(s => [
      format(s.date, 'yyyy-MM-dd'),
      s.sgeUsdPerOz.toFixed(2),
      s.comexUsdPerOz.toFixed(2),
      s.spreadUsdPerOz.toFixed(2),
      s.spreadPercent.toFixed(2),
      s.registered.toFixed(0),
      s.eligible.toFixed(0),
      s.total.toFixed(0),
      s.registeredPercent.toFixed(2),
      s.isExtreme ? 'Yes' : 'No',
      s.zScore?.toFixed(2) || '',
    ].join(','));
    
    const csv = [headers, ...rows].join('\n');
    
    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="silver-spread-${format(new Date(), 'yyyy-MM-dd')}.csv"`,
      },
    });
  } catch (error) {
    console.error('Error exporting data:', error);
    return NextResponse.json(
      { error: 'Failed to export data' },
      { status: 500 }
    );
  }
}
