// scripts/createSuperAdmin.js
// Run with: `node scripts/createSuperAdmin.js <email> <password> [name]`
// Creates a super_admin user in the database. Uses Prisma client.

const { prisma } = require('../config/database');
const bcrypt = require('bcrypt');

async function main() {
  const [, , email, password, name] = process.argv;
  if (!email || !password) {
    console.error('Usage: node createSuperAdmin.js <email> <password> [name]');
    process.exit(1);
  }
  const normalizedEmail = String(email).trim().toLowerCase();

  // Check if a super_admin already exists
  const existingSuper = await prisma.user.findFirst({ where: { role: 'super_admin' } });
  if (existingSuper) {
    console.error('Super admin already exists (id:', existingSuper.id, ')');
    process.exit(1);
  }

  // Ensure email is unique
  const existing = await prisma.user.findUnique({ where: { email: normalizedEmail } });
  if (existing) {
    console.error('Email already in use');
    process.exit(1);
  }

  const passwordHash = await bcrypt.hash(String(password), 10);

  const user = await prisma.user.create({
    data: {
      email: normalizedEmail,
      passwordHash,
      role: 'super_admin',
      isActive: true,
      name: name || null,
    },
  });

  console.log('Super admin created:');
  console.log({ id: user.id, email: user.email, role: user.role });
}

main()
  .catch((e) => {
    console.error('Error creating super admin:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
