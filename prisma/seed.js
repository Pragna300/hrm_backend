// backend/prisma/seed.js
// Seed script to create a default super admin user
// Run with: node backend/prisma/seed.js

const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
  const adminEmail = 'admin@example.com';
  const adminPassword = 'SuperSecret123!'; // Change this to a strong password before production

  const hashed = await bcrypt.hash(adminPassword, 10);

  // Adjust required fields based on your User model (e.g., organizationId, name, etc.)
  await prisma.user.upsert({
    where: { email: adminEmail },
    update: {},
    create: {
      email: adminEmail,
      passwordHash: hashed,
      role: 'super_admin',
      // Add any additional mandatory fields here, e.g.:
      // organizationId: 1,
      // name: 'Root Admin',
    },
  });

  console.log('✅ Super admin user created/updated successfully.');
}

main()
  .catch((e) => {
    console.error('❌ Seed error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
