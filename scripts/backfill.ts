#!/usr/bin/env tsx
/**
 * Backfill historical data for multiple days
 * Usage: npm run cron:backfill -- --days 30
 */

import { subDays, format, startOfDay } from 'date-fns';

async function backfill(days: number = 7) {
  console.log(`\n╔═══════════════════════════════════════╗`);
  console.log(`║  COMEX/SGE Data Backfill Tool         ║`);
  console.log(`║  Fetching last ${days.toString().padStart(2)} days                 ║`);
  console.log(`╚═══════════════════════════════════════╝\n`);

  const cronUrl = process.env.CRON_ENDPOINT || 'http://localhost:3000/api/cron/fetch-data';
  const cronSecret = process.env.CRON_SECRET;

  const results: { date: string; success: boolean; error?: string }[] = [];
  
  for (let i = days - 1; i >= 0; i--) {
    const targetDate = startOfDay(subDays(new Date(), i));
    const dateStr = format(targetDate, 'yyyy-MM-dd');
    
    console.log(`\n[${days - i}/${days}] Fetching ${dateStr}...`);
    
    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      
      if (cronSecret) {
        headers['Authorization'] = `Bearer ${cronSecret}`;
      }
      
      const response = await fetch(cronUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify({ date: targetDate.toISOString() }),
      });
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const data = await response.json();
      
      if (data.success) {
        console.log(`✓ Success: ${JSON.stringify(data.results)}`);
        results.push({ date: dateStr, success: true });
      } else {
        console.error(`✗ Failed: ${data.error || 'Unknown error'}`);
        results.push({ 
          date: dateStr, 
          success: false, 
          error: data.error || 'Unknown error' 
        });
      }
      
      // Rate limiting: wait 2 seconds between requests
      if (i > 0) {
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
      
    } catch (error) {
      console.error(`✗ Request failed:`, error);
      results.push({ 
        date: dateStr, 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
    }
  }
  
  // Summary
  console.log(`\n╔═══════════════════════════════════════╗`);
  console.log(`║  Backfill Summary                     ║`);
  console.log(`╚═══════════════════════════════════════╝\n`);
  
  const successful = results.filter(r => r.success).length;
  const failed = results.filter(r => !r.success).length;
  
  console.log(`Total:      ${results.length}`);
  console.log(`Successful: ${successful} ✓`);
  console.log(`Failed:     ${failed} ✗\n`);
  
  if (failed > 0) {
    console.log('Failed dates:');
    results.filter(r => !r.success).forEach(r => {
      console.log(`  - ${r.date}: ${r.error}`);
    });
    console.log('');
  }
  
  process.exit(failed > 0 ? 1 : 0);
}

// Parse CLI arguments
const args = process.argv.slice(2);
let days = 7; // Default

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--days' && args[i + 1]) {
    const parsed = parseInt(args[i + 1], 10);
    if (!isNaN(parsed) && parsed > 0 && parsed <= 365) {
      days = parsed;
    } else {
      console.error('Invalid --days value (must be 1-365)');
      process.exit(1);
    }
  }
}

backfill(days).catch(error => {
  console.error('Backfill failed:', error);
  process.exit(1);
});
