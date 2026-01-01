import { fetchComexStocks } from '../lib/fetchers/comex';
import { fetchFxRateWithRetry } from '../lib/fetchers/fx';
import { fetchSgePrice } from '../lib/fetchers/sge';
import { fetchComexSpotPrice } from '../lib/fetchers/comex-price';
import { prisma } from '../lib/db';
import { 
  calculateDailyChanges, 
  calculateSpread, 
  calculateRegisteredPercent,
  isExtremeValue,
  calculateZScore
} from '../lib/calculations';
import { format } from 'date-fns';

/**
 * Standalone script to fetch daily data
 * Can be run manually or via cron job
 * 
 * Usage: tsx scripts/fetch-data.ts
 */

async function main() {
  console.log('=== Starting Daily Data Fetch ===');
  
  const today = new Date();
  const dateStr = format(today, 'yyyy-MM-dd');
  
  console.log(`Date: ${dateStr}`);
  
  const results = {
    comex: false,
    fx: false,
    sge: false,
    comexPrice: false,
    spread: false,
  };
  
  const errors: string[] = [];
  
  // 1. Fetch FX Rate
  console.log('\n1. Fetching FX Rate...');
  let fxData;
  try {
    fxData = await fetchFxRateWithRetry(today);
    
    if (fxData) {
      await prisma.fxRate.upsert({
        where: { date: today },
        create: {
          date: today,
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
        where: { marketDate: today },
        create: {
          marketDate: today,
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
