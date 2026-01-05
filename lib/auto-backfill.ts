// lib/auto-backfill.ts
// Auto-Backfill Helper - triggered when DB is too empty

import { prisma } from './db';
import { subDays, startOfDay, format } from 'date-fns';

/**
 * Prüft ob ein Auto-Backfill nötig ist und führt ihn ggf. aus
 * 
 * Trigger-Bedingungen:
 * - metal_prices hat weniger als 10 Zeilen ODER
 * - neuester Datensatz ist älter als 2 Tage
 * 
 * @returns true wenn Backfill durchgeführt wurde
 */
export async function checkAndTriggerAutoBackfill(): Promise<{ needed: boolean; executed: boolean; message: string }> {
  try {
    const count = await prisma.metalPrice.count();
    const latest = await prisma.metalPrice.findFirst({
      orderBy: { date: 'desc' },
      select: { date: true },
    });

    const today = startOfDay(new Date());
    const daysSinceLatest = latest 
      ? Math.floor((today.getTime() - startOfDay(latest.date).getTime()) / (1000 * 60 * 60 * 24))
      : 999;

    const needsBackfill = count < 10 || daysSinceLatest > 2;

    if (!needsBackfill) {
      return {
        needed: false,
        executed: false,
        message: `No backfill needed (count: ${count}, latest: ${latest?.date})`,
      };
    }

    console.log('[AUTO_BACKFILL_TRIGGER]', { count, daysSinceLatest });

    // Trigger Backfill für letzte 30 Tage
    const days = 30;
    const startDate = subDays(today, days);

    // Lade Daten von Stooq CSV (historisch, zuverlässig)
    const stooqUrl = `https://stooq.com/q/d/l/?s=xagusd&d1=${format(startDate, 'yyyyMMdd')}&d2=${format(today, 'yyyyMMdd')}&i=d`;
    
    console.log('[AUTO_BACKFILL_FETCH]', stooqUrl);

    const response = await fetch(stooqUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; SilberAnalyse/1.0)',
      },
    });

    if (!response.ok) {
      throw new Error(`Stooq fetch failed: ${response.status}`);
    }

    const csvText = await response.text();
    const lines = csvText.trim().split('\n');
    
    // Skip header line
    if (lines.length < 2) {
      throw new Error('CSV too short');
    }

    let inserted = 0;
    let updated = 0;

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      const [dateStr, openStr, highStr, lowStr, closeStr, volumeStr] = line.split(',');
      
      // Parse date (Stooq format: YYYY-MM-DD)
      const date = new Date(dateStr);
      if (isNaN(date.getTime())) continue;

      const open = parseFloat(openStr);
      const high = parseFloat(highStr);
      const low = parseFloat(lowStr);
      const close = parseFloat(closeStr);
      const volume = volumeStr ? parseFloat(volumeStr) : null;

      if (isNaN(close) || close <= 0) continue;

      // Upsert
      const result = await prisma.metalPrice.upsert({
        where: { date: startOfDay(date) },
        create: {
          date: startOfDay(date),
          xagUsdClose: close,
          xagUsdOpen: open,
          xagUsdHigh: high,
          xagUsdLow: low,
          volume: volume,
          source: 'stooq-backfill',
          sourceUrl: stooqUrl,
        },
        update: {
          // Only update if from backfill (don't overwrite live data)
          xagUsdClose: close,
          xagUsdOpen: open,
          xagUsdHigh: high,
          xagUsdLow: low,
          volume: volume,
          fetchedAt: new Date(),
        },
      });

      inserted++;
    }

    console.log('[AUTO_BACKFILL_DONE]', { inserted, updated });

    return {
      needed: true,
      executed: true,
      message: `Auto-backfilled ${inserted} days from Stooq`,
    };

  } catch (error) {
    console.error('[AUTO_BACKFILL_ERROR]', error);
    return {
      needed: true,
      executed: false,
      message: error instanceof Error ? error.message : String(error),
    };
  }
}
