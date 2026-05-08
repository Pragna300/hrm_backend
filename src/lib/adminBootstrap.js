const bcrypt = require('bcrypt');
const { prisma } = require('../config/database');

function parsePersonName(name, email) {
  const normalizedName = String(name || '').trim();
  const nameParts = normalizedName ? normalizedName.split(/\s+/) : [];
  const fallbackFromEmail = String(email || '').split('@')[0] || 'Admin';

  return {
    firstName: nameParts[0] || fallbackFromEmail,
    lastName: nameParts.slice(1).join(' ') || 'User',
  };
}

async function createBootstrapAdmin({ email, password, name }) {
  const normalizedEmail = String(email || '').trim().toLowerCase();
  if (!normalizedEmail || !password) {
    return {
      success: false,
      statusCode: 400,
      message: 'email and password are required',
    };
  }

  const existingAdmin = await prisma.user.findFirst({ where: { role: 'admin' } });
  if (existingAdmin) {
    return {
      success: false,
      statusCode: 409,
      message: 'Admin account already exists',
    };
  }

  const existingEmail = await prisma.user.findUnique({ where: { email: normalizedEmail } });
  if (existingEmail) {
    return {
      success: false,
      statusCode: 409,
      message: 'Email already exists',
    };
  }

  const passwordHash = await bcrypt.hash(String(password), 10);
  const parsedName = parsePersonName(name, normalizedEmail);
  const employeeCode = `ADM${Date.now().toString().slice(-8)}`;

  const adminUser = await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        email: normalizedEmail,
        passwordHash,
        role: 'admin',
        isActive: true,
      },
    });

    await tx.employee.create({
      data: {
        userId: user.id,
        employeeCode,
        firstName: parsedName.firstName,
        lastName: parsedName.lastName,
        workEmail: normalizedEmail,
        dateHired: new Date(),
      },
    });

    return user;
  });

  return {
    success: true,
    statusCode: 201,
    message: 'Admin account created successfully',
    data: { id: adminUser.id, email: adminUser.email, role: adminUser.role },
  };
}

module.exports = { createBootstrapAdmin };
