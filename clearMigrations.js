// clearMigrations.js
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
(async () => {
  try {
    await prisma.$executeRawUnsafe('TRUNCATE TABLE "_prisma_migrations" RESTART IDENTITY CASCADE;');
    console.log('Migration history cleared');
  } catch (e) {
    console.error('Error clearing migrations:', e);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
})();
