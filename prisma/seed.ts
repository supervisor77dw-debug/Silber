import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database with test data...');

  // Clear existing data
  await prisma.alertHistory.deleteMany();
  await prisma.fetchLog.deleteMany();
  await prisma.dailySpread.deleteMany();
  await prisma.comexWarehouse.deleteMany();
  await prisma.comexStock.deleteMany();
  await prisma.comexPrice.deleteMany();
  await prisma.sgePrice.deleteMany();
  await prisma.fxRate.deleteMany();

  // Insert FX Rates
  await prisma.fxRate.createMany({
    data: [
      {
        id: 'fx001',
        date: new Date('2026-01-01'),
        usdCnyRate: 7.25,
        source: 'manual',
      },
      {
        id: 'fx002',
        date: new Date('2025-12-31'),
        usdCnyRate: 7.24,
        source: 'manual',
      },
      {
        id: 'fx003',
        date: new Date('2025-12-30'),
        usdCnyRate: 7.26,
        source: 'manual',
      },
    ],
  });

  // Insert COMEX Prices
  await prisma.comexPrice.createMany({
    data: [
      {
        id: 'cp001',
        date: new Date('2026-01-01'),
        priceUsdPerOz: 32.50,
        contract: 'Spot',
      },
      {
        id: 'cp002',
        date: new Date('2025-12-31'),
        priceUsdPerOz: 32.45,
        contract: 'Spot',
      },
      {
        id: 'cp003',
        date: new Date('2025-12-30'),
        priceUsdPerOz: 32.40,
        contract: 'Spot',
      },
    ],
  });

  // Insert SGE Prices
  await prisma.sgePrice.createMany({
    data: [
      {
        id: 'sg001',
        date: new Date('2026-01-01'),
        priceCnyPerGram: 7.50,
        priceUsdPerOz: 32.80,
      },
      {
        id: 'sg002',
        date: new Date('2025-12-31'),
        priceCnyPerGram: 7.48,
        priceUsdPerOz: 32.75,
      },
      {
        id: 'sg003',
        date: new Date('2025-12-30'),
        priceCnyPerGram: 7.47,
        priceUsdPerOz: 32.71,
      },
    ],
  });

  // Insert COMEX Stocks
  await prisma.comexStock.createMany({
    data: [
      {
        id: 'cs001',
        date: new Date('2026-01-01'),
        totalRegistered: 50000000,
        totalEligible: 150000000,
        totalCombined: 200000000,
        registeredPercent: 25.0,
        deltaRegistered: -500000,
        deltaEligible: 200000,
        deltaCombined: -300000,
        isValidated: true,
      },
      {
        id: 'cs002',
        date: new Date('2025-12-31'),
        totalRegistered: 50500000,
        totalEligible: 149800000,
        totalCombined: 200300000,
        registeredPercent: 25.2,
        deltaRegistered: -800000,
        deltaEligible: 300000,
        deltaCombined: -500000,
        isValidated: true,
      },
      {
        id: 'cs003',
        date: new Date('2025-12-30'),
        totalRegistered: 51300000,
        totalEligible: 149500000,
        totalCombined: 200800000,
        registeredPercent: 25.5,
        isValidated: true,
      },
    ],
  });

  // Insert Daily Spreads
  await prisma.dailySpread.createMany({
    data: [
      {
        id: 'ds001',
        date: new Date('2026-01-01'),
        sgeUsdPerOz: 32.80,
        comexUsdPerOz: 32.50,
        spreadUsdPerOz: 0.30,
        spreadPercent: 0.92,
        registered: 50000000,
        eligible: 150000000,
        total: 200000000,
        registeredPercent: 25.0,
        isExtreme: false,
        zScore: 0.5,
      },
      {
        id: 'ds002',
        date: new Date('2025-12-31'),
        sgeUsdPerOz: 32.75,
        comexUsdPerOz: 32.45,
        spreadUsdPerOz: 0.30,
        spreadPercent: 0.92,
        registered: 50500000,
        eligible: 149800000,
        total: 200300000,
        registeredPercent: 25.2,
        isExtreme: false,
        zScore: 0.4,
      },
      {
        id: 'ds003',
        date: new Date('2025-12-30'),
        sgeUsdPerOz: 32.71,
        comexUsdPerOz: 32.40,
        spreadUsdPerOz: 0.31,
        spreadPercent: 0.96,
        registered: 51300000,
        eligible: 149500000,
        total: 200800000,
        registeredPercent: 25.5,
        isExtreme: false,
        zScore: 0.6,
      },
    ],
  });

  // Insert Fetch Log
  await prisma.fetchLog.create({
    data: {
      id: 'fl001',
      date: new Date('2026-01-01'),
      source: 'ALL',
      status: 'success',
    },
  });

  console.log('✓ Seed data inserted successfully!');
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error('Error seeding database:', e);
    await prisma.$disconnect();
    process.exit(1);
  });
