import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * Test endpoint to verify resilient routes work
 */
export async function GET() {
  return NextResponse.json({
    message: 'Resilient v2 endpoints available',
    endpoints: {
      dashboard: '/api/dashboard-v2',
      health: '/api/health-v2',
      triggerFetch: '/api/trigger-fetch-v2 (POST)',
    },
    migration: {
      status: 'testing',
      note: 'v2 endpoints are ready for testing. After verification, we will replace v1 endpoints.',
    },
  });
}
