import { fetchComexStocks } from '../lib/fetchers/comex';
import { fetchFxRateWithRetry } from '../lib/fetchers/fx';
import { fetchSgePrice } from '../lib/fetchers/sge';
import { fetchComexSpotPriceWithRetry } from '../lib/fetchers/comex-price';
import { prisma } from '../lib/db';
import { 
  calculateDailyChanges, 
  calculateSpread, 
  calculateRegisteredPercent,
  calculatePhysicalStressIndex,
  isExtremeValue,
  calculateZScore
} from '../lib/calculations';
import { format, startOfDay } from 'date-fns';

/**
 * Standalone script to fetch daily data
 * Can be run manually or via cron job
 * 
 * Usage: 
 *   tsx scripts/fetch-data.ts               # Fetch for today
 *   tsx scripts/fetch-data.ts 2025-01-15    # Fetch for specific date (backfill)
 */

async function main() {
  const startTime = Date.now();
  
  console.log('\n═══ Silver Market Data Fetcher ═══\n');
  
  // Parse command-line date argument if provided
  let targetDate: Date;
  const dateArg = process.argv[2];
  
  if (dateArg) {
    targetDate = new Date(dateArg);
    if (isNaN(targetDate.getTime())) {
      console.error(`✗ Invalid date format: ${dateArg}`);
      console.error('  Use format: YYYY-MM-DD');
      process.exit(1);
    }
  } else {
    targetDate = new Date();
  }
  
  // Normalize to start of day in UTC
  const marketDate = startOfDay(targetDate);
  const dateStr = format(marketDate, 'yyyy-MM-dd');
  
  console.log(`Target date: ${dateStr} (UTC)`);
  console.log(`Started at: ${new Date().toISOString()}\n`);
  
  const results = {
    comex: false,
    fx: false,
    sge: false,
    comexPrice: false,
    spread: false,
    psi: false,
  };
  
  
  // === STEP 1: FX Rate ===
  console.log('[1/5] Fetching FX Rate (USD/CNY)...');
  let fxData;
  try {
    fxData = await fetchFxRateWithRetry(marketDate, 3);
    
    if (fxData && fxData.usdCnyRate > 0) {
      await prisma.fxRate.upsert({
        where: { date: marketDate },
        create: {
          date: marketDate,
          usdCnyRate: fxData.usdCnyRate,
          source: fxData.source,
        },
        update: {
          usdCnyRate: fxData.usdCnyRate,
          source: fxData.source,
          fetchedAt: new Date(),
        },
      });
      
      results.fx = true;
      console.log(`✓ FX: ${fxData.usdCnyRate.toFixed(4)} from ${fxData.source}`);
    } else {
      errors.push({ source: 'FX', code: 'NO_DATA', message: 'No FX rate returned' });
      console.log('✗ FX: No data');
    }
  } catch (error) {
    console.error('✗ FX error:', error);
    errors.push({ 
      source: 'FX', 
      code: 'FETCH_ERROR', 
      message: error instanceof Error ? error.message : 'Unknown' 
    });
  }
  
  // === STEP 2: COMEX Stocks ===
  console.log('\n[2/5] Fetching COMEX Silver Stocks...');
  let comexData;
  try {
    comexData = await fetchComexStocks(marketDate);
    
    if (comexData) {
      const { deltaRegistered, deltaEligible, deltaCombined } = 
        await calculateDailyChanges(marketDate, comexData);
      
      const registeredPercent = calculateRegisteredPercent(
        comexData.totalRegistered, 
        comexData.totalCombined
      );
      
      const stock = await prisma.comexStock.upsert({
        where: { date: marketDate },
        create: {
          date: marketDate,
          totalRegistered: comexData.totalRegistered,
          totalEligible: comexData.totalEligible,
          totalCombined: comexData.totalCombined,
          deltaRegistered,
          deltaEligible,
          deltaCombined,
          registeredPercent,
          sourceUrl: comexData.sourceUrl,
          rawDataPath: comexData.rawDataPath,
          isValidated: true,
          fetchedAt: new Date(),
        },
        update: {
          totalRegistered: comexData.totalRegistered,
          totalEligible: comexData.totalEligible,
          totalCombined: comexData.totalCombined,
          deltaRegistered,
          deltaEligible,
          deltaCombined,
          registeredPercent,
          sourceUrl: comexData.sourceUrl,
          rawDataPath: comexData.rawDataPath,
          fetchedAt: new Date(),
        },
      });
      
      // Save warehouse details
      if (comexData.warehouses && comexData.warehouses.length > 0) {
        await prisma.comexWarehouse.deleteMany({
          where: { stockId: stock.id },
        });
        
        await prisma.comexWarehouse.createMany({
          data: comexData.warehouses.map(wh => ({
            stockId: stock.id,
            warehouseName: wh.warehouseName,
            registered: wh.registered,
            eligible: wh.eligible,
            deposits: wh.deposits,
            withdrawals: wh.withdrawals,
            adjustments: wh.adjustments,
          })),
        });
      }
      
      results.comex = true;
      console.log(`✓ COMEX: ${comexData.totalCombined.toLocaleString()} oz (${registeredPercent.toFixed(1)}% registered)`);
    } else {
      errors.push({ source: 'COMEX', code: 'NO_DATA', message: 'No stocks returned' });
      console.log('✗ COMEX: No data');
    }
  } catch (error) {
    console.error('✗ COMEX error:', error);
    errors.push({ 
      source: 'COMEX', 
      code: 'FETCH_ERROR', 
      message: error instanceof Error ? error.message : 'Unknown' 
    });
  }
  
  // === STEP 3: COMEX Spot Price ===
  console.log('\n[3/5] Fetching COMEX Spot Price...');
  let comexPriceData;
  try {
    comexPriceData = await fetchComexSpotPriceWithRetry(marketDate, 2);
    
    if (comexPriceData && comexPriceData.priceUsdPerOz > 0) {
      await prisma.comexPrice.upsert({
        where: { date: marketDate },
        create: {
          date: marketDate,
          priceUsdPerOz: comexPriceData.priceUsdPerOz,
          contract: comexPriceData.contract,
          fetchedAt: new Date(),
        },
        update: {
          priceUsdPerOz: comexPriceData.priceUsdPerOz,
          contract: comexPriceData.contract,
          fetchedAt: new Date(),
        },
      });
      
      results.comexPrice = true;
      console.log(`✓ COMEX Price: $${comexPriceData.priceUsdPerOz.toFixed(2)}/oz (${comexPriceData.contract})`);
    } else {
      errors.push({ source: 'COMEX_PRICE', code: 'NO_DATA', message: 'No price returned' });
      console.log('✗ COMEX Price: No data');
    }
  } catch (error) {
    console.error('✗ COMEX Price error:', error);
    errors.push({ 
      source: 'COMEX_PRICE', 
      code: 'FETCH_ERROR', 
      message: error instanceof Error ? error.message : 'Unknown' 
    });
  }
  
  // === STEP 4: SGE Price ===
  let sgePriceData;
  if (fxData && fxData.usdCnyRate > 0) {
    console.log('\n[4/5] Fetching SGE Benchmark Price...');
    try {
      sgePriceData = await fetchSgePrice(marketDate, fxData.usdCnyRate);
      
      if (sgePriceData && sgePriceData.priceUsdPerOz > 0) {
        await prisma.sgePrice.upsert({
          where: { date: marketDate },
          create: {
            date: marketDate,
            priceCnyPerGram: sgePriceData.priceCnyPerGram,
            priceUsdPerOz: sgePriceData.priceUsdPerOz,
            fetchedAt: new Date(),
          },
          update: {
            priceCnyPerGram: sgePriceData.priceCnyPerGram,
            priceUsdPerOz: sgePriceData.priceUsdPerOz,
            fetchedAt: new Date(),
          },
        });
        
        results.sge = true;
        console.log(`✓ SGE: $${sgePriceData.priceUsdPerOz.toFixed(2)}/oz (${sgePriceData.priceCnyPerGram.toFixed(2)} CNY/g)`);
      } else {
        errors.push({ source: 'SGE', code: 'NO_DATA', message: 'No price returned' });
        console.log('✗ SGE: No data');
      }
    } catch (error) {
      console.error('✗ SGE error:', error);
      errors.push({ 
        source: 'SGE', 
        code: 'FETCH_ERROR', 
        message: error instanceof Error ? error.message : 'Unknown' 
      });
    }
  } else {
    console.log('\n[4/5] Skipping SGE (FX rate unavailable)');
    errors.push({ source: 'SGE', code: 'DEPENDENCY_FAILED', message: 'FX rate required' });
  }
  
  // === STEP 5: Calculate Spread + PSI ===
  if (sgePriceData && comexPriceData && comexData) {
    console.log('\n[5/5] Calculating Spread and PSI...');
    try {
      const { spreadUsdPerOz, spreadPercent } = calculateSpread(
        sgePriceData.priceUsdPerOz,
        comexPriceData.priceUsdPerOz
      );
      
      const registeredPercent = calculateRegisteredPercent(
        comexData.totalRegistered,
        comexData.totalCombined
      );
      
      const psiResult = calculatePhysicalStressIndex({
        spreadUsdPerOz,
        totalRegistered: comexData.totalRegistered,
        totalCombined: comexData.totalCombined,
      });
      
      const isExtreme = await isExtremeValue(spreadUsdPerOz, 'spread');
      const zScore = await calculateZScore(spreadUsdPerOz, 'spread');
      
      await prisma.dailySpread.upsert({
        where: { date: marketDate },
        create: {
          date: marketDate,
          sgeUsdPerOz: sgePriceData.priceUsdPerOz,
          comexUsdPerOz: comexPriceData.priceUsdPerOz,
          spreadUsdPerOz,
          spreadPercent,
          registered: comexData.totalRegistered,
          eligible: comexData.totalEligible,
          total: comexData.totalCombined,
          registeredPercent,
          psi: psiResult.psi,
          psiStressLevel: psiResult.stressLevel,
          isExtreme,
          zScore,
        },
        update: {
          sgeUsdPerOz: sgePriceData.priceUsdPerOz,
          comexUsdPerOz: comexPriceData.priceUsdPerOz,
          spreadUsdPerOz,
          spreadPercent,
          registered: comexData.totalRegistered,
          eligible: comexData.totalEligible,
          total: comexData.totalCombined,
          registeredPercent,
          psi: psiResult.psi,
          psiStressLevel: psiResult.stressLevel,
          isExtreme,
          zScore,
        },
      });
      
      results.spread = true;
      results.psi = psiResult.psi !== null;
      
      console.log(`✓ Spread: $${spreadUsdPerOz.toFixed(2)}/oz (${spreadPercent.toFixed(2)}%)`);
      if (psiResult.psi !== null) {
        console.log(`✓ PSI: ${psiResult.psi.toFixed(2)} [${psiResult.stressLevel}]`);
      }
    } catch (error) {
      console.error('✗ Spread calculation error:', error);
      errors.push({ 
        source: 'SPREAD', 
        code: 'CALC_ERROR', 
        message: error instanceof Error ? error.message : 'Unknown' 
      });
    }
  } else {
    console.log('\n[5/5] Skipping Spread (missing dependencies)');
    const missing = [];
    if (!sgePriceData) missing.push('SGE');
    if (!comexPriceData) missing.push('COMEX price');
    if (!comexData) missing.push('COMEX stocks');
    errors.push({ 
      source: 'SPREAD', 
      code: 'DEPENDENCY_FAILED', 
      message: `Missing: ${missing.join(', ')}` 
    });
  }
  
  // === Log Results ===
  const duration = Date.now() - startTime;
  const status = errors.length === 0 ? 'SUCCESS' : 
                 Object.values(results).some(v => v) ? 'PARTIAL' : 'FAILED';
  
  await prisma.fetchLog.create({
    data: {
      date: marketDate,
      source: 'ALL',
      status: status.toLowerCase(),
      errorMsg: errors.length > 0 ? JSON.stringify(errors) : null,
    },
  });
  
  console.log('\n═══ Summary ═══');
  console.log(`Status: ${status}`);
  console.log(`Duration: ${duration}ms`);
  console.log(`Results:`, results);
  
  if (errors.length > 0) {
    console.log('\n✗ Errors:');
    errors.forEach(err => {
      console.log(`  - [${err.source}] ${err.code}: ${err.message}`);
    });
  }
  
  console.log('\n═══ Fetch Complete ═══\n');
  
  process.exit(errors.length === 0 ? 0 : 1);
}

main()
  .catch((error) => {
    console.error('\n✗ FATAL ERROR:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });


          usdCnyRate: fxData.usdCnyRate,
          source: fxData.source,
        },
        update: {
          usdCnyRate: fxData.usdCnyRate,
          source: fxData.source,
        },
      });
      
      results.fx = true;
      console.log(`✓ FX rate saved: ${fxData.usdCnyRate} (${fxData.source})`);
    } else {
      errors.push('Failed to fetch FX rate');
      console.error('✗ Failed to fetch FX rate');
    }
  } catch (error) {
    console.error('✗ FX fetch error:', error);
    errors.push(`FX error: ${error}`);
  }
  
  // 2. Fetch COMEX Stocks
  console.log('\n2. Fetching COMEX Stocks...');
  let comexData;
  try {
    comexData = await fetchComexStocks(today);
    
    if (comexData) {
      const { deltaRegistered, deltaEligible, deltaCombined } = 
        await calculateDailyChanges(today, comexData);
      
      const registeredPercent = calculateRegisteredPercent(
        comexData.totalRegistered, 
        comexData.totalCombined
      );
      
      const stock = await prisma.comexStock.upsert({
        where: { date: today },
        create: {
          date: today,
          totalRegistered: comexData.totalRegistered,
          totalEligible: comexData.totalEligible,
          totalCombined: comexData.totalCombined,
          deltaRegistered,
          deltaEligible,
          deltaCombined,
          registeredPercent,
          isValidated: true,
        },
        update: {
          totalRegistered: comexData.totalRegistered,
          totalEligible: comexData.totalEligible,
          totalCombined: comexData.totalCombined,
          deltaRegistered,
          deltaEligible,
          deltaCombined,
          registeredPercent,
        },
      });
      
      // Save warehouse details if available
      if (comexData.warehouses && comexData.warehouses.length > 0) {
        await prisma.comexWarehouse.deleteMany({
          where: { stockId: stock.id },
        });
        
        await prisma.comexWarehouse.createMany({
          data: comexData.warehouses.map((wh: any) => ({
            stockId: stock.id,
            warehouseName: wh.warehouseName,
            registered: wh.registered,
            eligible: wh.eligible,
            deposits: wh.deposits,
            withdrawals: wh.withdrawals,
            adjustments: wh.adjustments,
          })),
        });
      }
      
      results.comex = true;
      console.log(`✓ COMEX stocks saved: ${comexData.totalCombined.toLocaleString()} oz`);
      console.log(`  Registered: ${comexData.totalRegistered.toLocaleString()} oz (${registeredPercent.toFixed(2)}%)`);
      console.log(`  Eligible: ${comexData.totalEligible.toLocaleString()} oz`);
    } else {
      errors.push('Failed to fetch COMEX stocks');
      console.error('✗ Failed to fetch COMEX stocks');
    }
  } catch (error) {
    console.error('✗ COMEX fetch error:', error);
    errors.push(`COMEX error: ${error}`);
  }
  
  // 3. Fetch COMEX Spot Price
  console.log('\n3. Fetching COMEX Spot Price...');
  let comexPriceData;
  try {
    comexPriceData = await fetchComexSpotPrice(today);
    
    if (comexPriceData) {
      await prisma.comexPrice.upsert({
        where: { date: today },
        create: {
          date: today,
          priceUsdPerOz: comexPriceData.priceUsdPerOz,
          contract: comexPriceData.contract,
        },
        update: {
          priceUsdPerOz: comexPriceData.priceUsdPerOz,
          contract: comexPriceData.contract,
        },
      });
      
      results.comexPrice = true;
      console.log(`✓ COMEX price saved: $${comexPriceData.priceUsdPerOz}/oz`);
    } else {
      errors.push('Failed to fetch COMEX price (not implemented)');
      console.warn('⚠ COMEX price fetching not implemented');
    }
  } catch (error) {
    console.error('✗ COMEX price fetch error:', error);
    errors.push(`COMEX price error: ${error}`);
  }
  
  // 4. Fetch SGE Price
  console.log('\n4. Fetching SGE Price...');
  let sgePriceData;
  if (fxData) {
    try {
      sgePriceData = await fetchSgePrice(today, fxData.usdCnyRate);
      
      if (sgePriceData) {
        await prisma.sgePrice.upsert({
          where: { date: today },
          create: {
            date: today,
            priceCnyPerGram: sgePriceData.priceCnyPerGram,
            priceUsdPerOz: sgePriceData.priceUsdPerOz,
          },
          update: {
            priceCnyPerGram: sgePriceData.priceCnyPerGram,
            priceUsdPerOz: sgePriceData.priceUsdPerOz,
          },
        });
        
        results.sge = true;
        console.log(`✓ SGE price saved: $${sgePriceData.priceUsdPerOz}/oz`);
      } else {
        errors.push('Failed to fetch SGE price (not implemented)');
        console.warn('⚠ SGE price fetching not implemented');
      }
    } catch (error) {
      console.error('✗ SGE fetch error:', error);
      errors.push(`SGE error: ${error}`);
    }
  }
  
  // 5. Calculate and save spread
  if (sgePriceData && comexPriceData && comexData) {
    console.log('\n5. Calculating Spread...');
    try {
      const { spreadUsdPerOz, spreadPercent } = calculateSpread(
        sgePriceData.priceUsdPerOz,
        comexPriceData.priceUsdPerOz
      );
      
      const registeredPercent = calculateRegisteredPercent(
        comexData.totalRegistered,
        comexData.totalCombined
      );
      
      const isExtreme = await isExtremeValue(spreadUsdPerOz, 'spread');
      const zScore = await calculateZScore(spreadUsdPerOz, 'spread');
      
      await prisma.dailySpread.upsert({
        where: { date: today },
        create: {
          date: today,
          sgeUsdPerOz: sgePriceData.priceUsdPerOz,
          comexUsdPerOz: comexPriceData.priceUsdPerOz,
          spreadUsdPerOz,
          spreadPercent,
          registered: comexData.totalRegistered,
          eligible: comexData.totalEligible,
          total: comexData.totalCombined,
          registeredPercent,
          isExtreme,
          zScore,
        },
        update: {
          sgeUsdPerOz: sgePriceData.priceUsdPerOz,
          comexUsdPerOz: comexPriceData.priceUsdPerOz,
          spreadUsdPerOz,
          spreadPercent,
          registered: comexData.totalRegistered,
          eligible: comexData.totalEligible,
          total: comexData.totalCombined,
          registeredPercent,
          isExtreme,
          zScore,
        },
      });
      
      results.spread = true;
      console.log(`✓ Spread calculated: $${spreadUsdPerOz.toFixed(2)}/oz (${spreadPercent.toFixed(2)}%)`);
      
      if (isExtreme) {
        console.log(`⚠ EXTREME VALUE DETECTED! Z-Score: ${zScore?.toFixed(2)}`);
      }
    } catch (error) {
      console.error('✗ Spread calculation error:', error);
      errors.push(`Spread error: ${error}`);
    }
  }
  
  // Log fetch status
  await prisma.fetchLog.create({
    data: {
      date: today,
      source: 'ALL',
      status: errors.length === 0 ? 'success' : 'partial',
      errorMsg: errors.length > 0 ? errors.join('; ') : null,
    },
  });
  
  console.log('\n=== Fetch Summary ===');
  console.log('Results:', results);
  
  if (errors.length > 0) {
    console.log('\n⚠ Errors:');
    errors.forEach(err => console.log(`  - ${err}`));
  } else {
    console.log('\n✓ All data fetched successfully!');
  }
  
  console.log('\n=== Fetch Complete ===');
}

main()
  .then(() => {
    prisma.$disconnect();
    process.exit(0);
  })
  .catch((error) => {
    console.error('Fatal error:', error);
    prisma.$disconnect();
    process.exit(1);
  });
