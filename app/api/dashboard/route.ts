import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function GET() {
  try {
    const latestSpread = await prisma.dailySpread.findFirst({
      orderBy: {
        date: 'desc',
      },
    });
    
    const latestComexStock = await prisma.comexStock.findFirst({
      orderBy: {
        date: 'desc',
      },
      include: {
        warehouses: true,
      },
    });
    
    const latestFetchLog = await prisma.fetchLog.findFirst({
      orderBy: {
        fetchedAt: 'desc',
      },
    });
    
    // Get 7-day trend
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    
    const weekData = await prisma.dailySpread.findMany({
      where: {
        date: {
          gte: sevenDaysAgo,
        },
      },
      orderBy: {
        date: 'asc',
      },
    });
    
    // Calculate trends
    let spreadTrend: 'up' | 'down' | 'stable' = 'stable';
    let registeredTrend: 'up' | 'down' | 'stable' = 'stable';
    
    if (weekData.length >= 2) {
      const first = weekData[0];
      const last = weekData[weekData.length - 1];
      
      const spreadChange = last.spreadUsdPerOz - first.spreadUsdPerOz;
      spreadTrend = spreadChange > 0.1 ? 'up' : spreadChange < -0.1 ? 'down' : 'stable';
      
      const registeredChange = last.registered - first.registered;
      registeredTrend = registeredChange > 0 ? 'up' : registeredChange < 0 ? 'down' : 'stable';
    }
    
    return NextResponse.json({
      currentSpread: latestSpread,
      currentStock: latestComexStock,
      lastFetch: latestFetchLog,
      trends: {
        spread: spreadTrend,
        registered: registeredTrend,
      },
      weekData,
    });
  } catch (error) {
    console.error('Error fetching dashboard data:', error);
    
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const isDbError = errorMessage.includes('Can\'t reach database') || 
                      errorMessage.includes('P1001') || 
                      errorMessage.includes('ECONNREFUSED');
    
    return NextResponse.json(
      { 
        error: 'Failed to fetch dashboard data',
        details: errorMessage,
        hint: isDbError 
          ? 'Database connection failed. Check DATABASE_URL and DIRECT_URL environment variables.'
          : 'Internal server error. Check server logs for details.'
      },
      { status: 500 }
    );
  }
}
