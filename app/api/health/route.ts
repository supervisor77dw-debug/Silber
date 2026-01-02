import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({ 
    status: 'ok',
    message: 'Silver Market Analysis API is running',
    timestamp: new Date().toISOString(),
    env: {
      hasDatabaseUrl: !!process.env.DATABASE_URL,
      hasDirectUrl: !!process.env.DIRECT_URL,
      hasCronSecret: !!process.env.CRON_SECRET,
      nodeEnv: process.env.NODE_ENV,
    }
  });
}
