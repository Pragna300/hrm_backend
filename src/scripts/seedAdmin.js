require('dotenv').config();

const { prisma } = require('../config/database');
const { createBootstrapSuperAdmin } = require('../lib/adminBootstrap');
const { ensurePlansSeeded } = require('../lib/seedPlans');

function resolveSuperAdminInput() {
  return {
    email: process.env.SUPER_ADMIN_EMAIL || process.env.ADMIN_EMAIL || 'owner@hrm.local',
    password: process.env.SUPER_ADMIN_PASSWORD || process.env.ADMIN_PASSWORD || 'Owner@123',
    name: process.env.SUPER_ADMIN_NAME || process.env.ADMIN_NAME || 'Platform Owner',
  };
}

async function run() {
  await ensurePlansSeeded();
  const result = await createBootstrapSuperAdmin(resolveSuperAdminInput());

  console.log(
    JSON.stringify(
      {
        success: result.success,
        message: result.message,
        data: result.data || null,
      },
      null,
      2
    )
  );

  if (!result.success) process.exitCode = 1;
}

run()
  .catch((err) => {
    console.error('Failed to seed super admin:', err?.message || err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
