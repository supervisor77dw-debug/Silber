import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { startOfDay, subDays, format, parseISO } from 'date-fns';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * GET handler - Returns API usage instructions
 */
export async function GET() {
  return NextResponse.json({
    error: 'Method Not Allowed',
    message: 'This endpoint requires POST method with Authorization header',
    usage: {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer <your-secret-token>',
        'Content-Type': 'application/json'
      },
      body: {
        from: '2025-12-01',
        to: '2025-12-31',
        sources: ['metal']
      },
      example: 'curl -X POST https://silber-ten.vercel.app/api/backfill -H "Authorization: Bearer TOKEN" -H "Content-Type: application/json" --data \'{"from":"2025-12-01","to":"2025-12-31","sources":["metal"]}\''
    }
  }, { status: 405 });
}

/**
 * Backfill Endpoint - ARCHITEKTUR-KORREKT
 * 
 * POST /api/backfill
 * Body: {
 *   from: "2024-01-01",
 *   to: "2025-12-31",
 *   source: "stooq"  // optional, default: "stooq"
 * }
 * 
 * Auth: Requires CRON_SECRET header
 * 
 * Verhalten:
 * - Nutzt NUR öffentliche CSV-Daten (Stooq)
 * - Upsert in metal_prices (unique: date)
 * - Kein UI-Block
 * - Gibt Summary zurück
 */

interface StooqRow {
  Date: string;
  Open?: string;
  High?: string;
  Low?: string;
  Close: string;
  Volume?: string;
}

async function fetchStooqCsv(symbol: string): Promise<string> {
  const url = `https://stooq.com/q/d/l/?s=${symbol}&i=d`;
  
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    }
  });
  
  if (!response.ok) {
    throw new Error(`Stooq fetch failed: ${response.status}`);
  }
  
  return response.text();
}

function parseStooqCsv(csv: string): StooqRow[] {
  const lines = csv.trim().split('\n');
  
  if (lines.length < 2) {
    throw new Error('CSV empty or header-only');
  }
  
  const header = lines[0].split(',');
  const rows: StooqRow[] = [];
  
  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(',');
    
    if (values.length !== header.length) continue;
    
    const row: any = {};
    header.forEach((col, idx) => {
      row[col] = values[idx];
    });
    
    if (!row.Close || isNaN(parseFloat(row.Close))) continue;
    
    rows.push(row as StooqRow);
  }
  
  return rows;
}

function parseStooqDate(dateStr: string): Date {
  if (dateStr.includes('-')) {
    return startOfDay(parseISO(dateStr));
  } else {
    // YYYYMMDD format
    const year = parseInt(dateStr.substring(0, 4), 10);
    const month = parseInt(dateStr.substring(4, 6), 10);
    const day = parseInt(dateStr.substring(6, 8), 10);
    return startOfDay(new Date(year, month - 1, day));
  }
}

export async function POST(req: NextRequest) {
  console.log('[API HIT]', new Date().toISOString());
  
  try {
    // Auth: CRON_SECRET in header
    const authHeader = req.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;
    
    if (!cronSecret) {
      return NextResponse.json({ 
        error: 'CRON_SECRET not configured' 
      }, { status: 500 });
    }
    
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ 
        error: 'Unauthorized' 
      }, { status: 401 });
    }
    
    // Parse body
    const body = await req.json();
    const { from, to, source = 'stooq', sources } = body;
    
    if (!from || !to) {
      return NextResponse.json({
        error: 'Missing required fields: from, to'
      }, { status: 400 });
    }
    
    // Support sources array (for now only 'metal' supported)
    const requestedSources = sources || ['metal'];
    if (!requestedSources.includes('metal')) {
      return NextResponse.json({
        error: 'Only metal source supported currently'
      }, { status: 400 });
    }
    
    const startDate = startOfDay(parseISO(from));
    const endDate = startOfDay(parseISO(to));
    
    console.log(`[Backfill] ${format(startDate, 'yyyy-MM-dd')} to ${format(endDate, 'yyyy-MM-dd')}`);
    
    // Fetch Stooq CSV
    const csvData = await fetchStooqCsv('xagusd');
    const rows = parseStooqCsv(csvData);
    
    console.log(`[Backfill] Parsed ${rows.length} rows from CSV`);
    
    // Filter by date range
    const filteredRows = rows.filter(row => {
      const date = parseStooqDate(row.Date);
      return date >= startDate && date <= endDate;
    });
    
    console.log(`[Backfill] ${filteredRows.length} rows in range`);
    
    // Upsert into DB
    let inserted = 0;
    let updated = 0;
    let errors = 0;
    
    for (const row of filteredRows) {
      try {
        const date = parseStooqDate(row.Date);
        const close = parseFloat(row.Close);
        const open = row.Open ? parseFloat(row.Open) : null;
        const high = row.High ? parseFloat(row.High) : null;
        const low = row.Low ? parseFloat(row.Low) : null;
        const volume = row.Volume ? parseFloat(row.Volume) : null;
        
        // Validation: 10-200 USD/oz
        if (close < 10 || close > 200) {
          console.warn(`[Backfill] Invalid price ${close} for ${row.Date}, skip`);
          errors++;
          continue;
        }
        
        const existing = await prisma.metalPrice.findUnique({
          where: { date }
        });
        
        await prisma.metalPrice.upsert({
          where: { date },
          create: {
            date,
            xagUsdClose: close,
            xagUsdOpen: open,
            xagUsdHigh: high,
            xagUsdLow: low,
            volume,
            source,
            sourceUrl: 'https://stooq.com/q/d/l/?s=xagusd&i=d'
          },
          update: {
            xagUsdClose: close,
            xagUsdOpen: open,
            xagUsdHigh: high,
            xagUsdLow: low,
            volume,
            source,
            fetchedAt: new Date()
          }
        });
        
        console.log('[DB WRITE]', { table: 'metal_prices', date: format(date, 'yyyy-MM-dd'), value: close });
        if (existing) {
          updated++;
        } else {
          inserted++;
        }
        
      } catch (err: any) {
        console.error(`[Backfill] Error at ${row.Date}:`, err.message);
        errors++;
      }
    }
    
    console.log(`[Backfill] Done: ${inserted} inserted, ${updated} updated, ${errors} errors`);
    
    return NextResponse.json({
      ok: true,
      wrote: {
        metal: inserted + updated
      },
      skippedDays: errors,
      sourceStatus: {
        metal: errors === 0 ? 'live' : 'partial'
      },
      summary: {
        timeRange: {
          from: format(startDate, 'yyyy-MM-dd'),
          to: format(endDate, 'yyyy-MM-dd')
        },
        totalRows: rows.length,
        filteredRows: filteredRows.length,
        inserted,
        updated,
        errors
      },
      message: `Backfill complete: ${inserted} new, ${updated} updated, ${errors} errors`
    });
  } catch (error: any) {
    console.error('[Backfill] Error:', error);
    
    return NextResponse.json({
      ok: false,
      error: error.message
    }, { status: 500 });
  }
}
