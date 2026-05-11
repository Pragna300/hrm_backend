const bcrypt = require('bcrypt');
const { prisma } = require('../config/database');

/**
 * Creates the very first super_admin (platform owner). This is the only
 * role that lives outside any organization. Idempotent: if a super_admin
 * already exists this becomes a no-op.
 */
async function createBootstrapSuperAdmin({ email, password, name }) {
  const normalizedEmail = String(email || '').trim().toLowerCase();
  if (!normalizedEmail || !password) {
    return { success: false, statusCode: 400, message: 'email and password are required' };
  }

  const existingSuperAdmin = await prisma.user.findFirst({ where: { role: 'super_admin' } });
  if (existingSuperAdmin) {
    return { success: false, statusCode: 409, message: 'Super admin already exists' };
  }

  const existingEmail = await prisma.user.findUnique({ where: { email: normalizedEmail } });
  if (existingEmail) {
    return { success: false, statusCode: 409, message: 'Email already exists' };
  }

  const passwordHash = await bcrypt.hash(String(password), 10);
  const user = await prisma.user.create({
    data: {
      email: normalizedEmail,
      passwordHash,
      role: 'super_admin',
      isActive: true,
    },
  });

  return {
    success: true,
    statusCode: 201,
    message: 'Super admin created',
    data: { id: user.id, email: user.email, role: user.role, name: name || null },
  };
}

module.exports = { createBootstrapSuperAdmin };
