const cron = require('node-cron');
const { prisma } = require('../config/database');

function initTrialExpirationJob() {
  // Run automatically every day at midnight server time
  cron.schedule('0 0 * * *', async () => {
    try {
      const now = new Date();

      const expiredCompanies = await prisma.organization.findMany({
        where: {
          status: 'active',
          trialEndsAt: {
            lt: now,
          },
        },
      });

      for (const company of expiredCompanies) {
        await prisma.organization.update({
          where: { id: company.id },
          data: {
            status: 'suspended',
          },
        });

        console.log(`Company suspended automatically due to trial expiration: ${company.name}`);
      }
    } catch (error) {
      console.error('Trial expiration cron failed:', error);
    }
  });
}

module.exports = { initTrialExpirationJob };
