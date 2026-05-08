require('dotenv').config();

const { prisma } = require('../config/database');
const { createBootstrapAdmin } = require('../lib/adminBootstrap');

function resolveAdminSeedInput() {
  return {
    email: process.env.ADMIN_EMAIL || 'admin@hrm.local',
    password: process.env.ADMIN_PASSWORD || 'Admin@123',
    name: process.env.ADMIN_NAME || 'System Admin',
  };
}

async function runAdminSeed() {
  const adminInput = resolveAdminSeedInput();
  const result = await createBootstrapAdmin(adminInput);

  if (!result.success) {
    console.log(
      JSON.stringify(
        {
          success: false,
          message: result.message,
          hint: 'Set ADMIN_EMAIL, ADMIN_PASSWORD, ADMIN_NAME to customize values',
        },
        null,
        2
      )
    );
    process.exitCode = 1;
    return;
  }

  console.log(
    JSON.stringify(
      {
        success: true,
        message: result.message,
        data: result.data,
      },
      null,
      2
    )
  );
}

runAdminSeed()
  .catch((error) => {
    console.error('Failed to seed admin user:', error?.message || error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
