let prisma = null;

function getPrisma() {
  if (!prisma) {
    // Lazily require so this file exists before installing deps
    // and so tests can mock it.
    // eslint-disable-next-line global-require
    const { PrismaClient } = require('@prisma/client');
    prisma = new PrismaClient();
  }
  return prisma;
}

module.exports = { getPrisma };

