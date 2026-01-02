import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { startOfDay, subDays, format } from 'date-fns';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Backfill Endpoint: Holt historische Silberpreise von Stooq
 * 
 * Protected: Benötigt CRON_SECRET
 * 
 * GET /api/admin/backfill?token=xxx&months=1
 * GET /api/admin/backfill?token=xxx&from=2025-12-01&to=2025-12-31
 */

interface StooqRow {
  Date: string;      // YYYYMMDD oder YYYY-MM-DD
  Open?: string;
  High?: string;
  Low?: string;
  Close: string;     // Required
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
    throw new Error(`Stooq fetch failed: ${response.status} ${response.statusText}`);
  }
  
  return response.text();
}

function parseStooqCsv(csv: string): StooqRow[] {
  const lines = csv.trim().split('\n');
  
  if (lines.length < 2) {
    throw new Error('CSV hat keine Daten (nur Header oder leer)');
  }
  
  // Header: Date,Open,High,Low,Close,Volume
  const header = lines[0].split(',');
  const rows: StooqRow[] = [];
  
  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(',');
    
    if (values.length !== header.length) {
      console.warn(`Zeile ${i} hat ${values.length} Werte, erwartet ${header.length}. Überspringe.`);
      continue;
    }
    
    const row: any = {};
    header.forEach((col, idx) => {
      row[col] = values[idx];
    });
    
    // Close ist Pflicht
    if (!row.Close || row.Close === '' || isNaN(parseFloat(row.Close))) {
      console.warn(`Zeile ${i} hat keinen gültigen Close-Wert: ${row.Close}. Überspringe.`);
      continue;
    }
    
    rows.push(row as StooqRow);
  }
  
  return rows;
}

function parseStooqDate(dateStr: string): Date {
  // Stooq nutzt YYYYMMDD (z.B. "20251215") oder YYYY-MM-DD
  if (dateStr.includes('-')) {
    // YYYY-MM-DD
    return startOfDay(new Date(dateStr));
  } else {
    // YYYYMMDD
    const year = parseInt(dateStr.substring(0, 4), 10);
    const month = parseInt(dateStr.substring(4, 6), 10);
    const day = parseInt(dateStr.substring(6, 8), 10);
    return startOfDay(new Date(year, month - 1, day));
  }
}

export async function GET(req: NextRequest) {
  try {
    // Auth: CRON_SECRET
    const token = req.nextUrl.searchParams.get('token');
    const cronSecret = process.env.CRON_SECRET;
    
    if (!cronSecret) {
      return NextResponse.json({ 
        error: 'CRON_SECRET nicht konfiguriert' 
      }, { status: 500 });
    }
    
    if (token !== cronSecret) {
      return NextResponse.json({ 
        error: 'Unauthorized: Falsches Token' 
      }, { status: 401 });
    }
    
    // Date range bestimmen
    let startDate: Date;
    let endDate: Date = startOfDay(new Date());
    
    const fromParam = req.nextUrl.searchParams.get('from');
    const toParam = req.nextUrl.searchParams.get('to');
    const monthsParam = req.nextUrl.searchParams.get('months');
    
    if (fromParam && toParam) {
      // Expliziter Zeitraum
      startDate = startOfDay(new Date(fromParam));
      endDate = startOfDay(new Date(toParam));
    } else if (monthsParam) {
      // X Monate zurück
      const months = parseInt(monthsParam, 10);
      startDate = subDays(endDate, months * 30);
    } else {
      // Default: Dezember 2025
      startDate = new Date('2025-12-01');
      endDate = new Date('2025-12-31');
    }
    
    console.log(`[Backfill] Zeitraum: ${format(startDate, 'yyyy-MM-dd')} bis ${format(endDate, 'yyyy-MM-dd')}`);
    
    // 1) Stooq CSV holen
    const csvData = await fetchStooqCsv('xagusd');
    const rows = parseStooqCsv(csvData);
    
    console.log(`[Backfill] ${rows.length} Zeilen aus Stooq CSV gelesen`);
    
    // 2) Filtern nach Zeitraum
    const filteredRows = rows.filter(row => {
      const date = parseStooqDate(row.Date);
      return date >= startDate && date <= endDate;
    });
    
    console.log(`[Backfill] ${filteredRows.length} Zeilen im Zeitraum ${format(startDate, 'yyyy-MM-dd')} - ${format(endDate, 'yyyy-MM-dd')}`);
    
    // 3) DB Upsert
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
        
        // Validierung: Preis muss plausibel sein (10-200 USD/oz)
        if (close < 10 || close > 200) {
          console.warn(`[Backfill] Unplausibler Preis für ${row.Date}: ${close} USD/oz. Überspringe.`);
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
            source: 'stooq',
            sourceUrl: 'https://stooq.com/q/d/l/?s=xagusd&i=d'
          },
          update: {
            xagUsdClose: close,
            xagUsdOpen: open,
            xagUsdHigh: high,
            xagUsdLow: low,
            volume,
            source: 'stooq',
            sourceUrl: 'https://stooq.com/q/d/l/?s=xagusd&i=d',
            fetchedAt: new Date()
          }
        });
        
        if (existing) {
          updated++;
        } else {
          inserted++;
        }
        
      } catch (err: any) {
        console.error(`[Backfill] Fehler bei ${row.Date}:`, err.message);
        errors++;
      }
    }
    
    console.log(`[Backfill] Fertig: ${inserted} inserted, ${updated} updated, ${errors} errors`);
    
    return NextResponse.json({
      success: true,
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
      message: `Backfill abgeschlossen: ${inserted} neu, ${updated} aktualisiert, ${errors} Fehler`
    });
    
  } catch (error: any) {
    console.error('[Backfill] Fehler:', error);
    
    return NextResponse.json({
      success: false,
      error: error.message,
      message: 'Backfill fehlgeschlagen'
    }, { status: 500 });
  }
}
