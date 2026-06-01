const bcrypt = require('bcrypt');
const { prisma } = require('../config/database');
const { createAdminSchema } = require('../validators/adminSchemas');

/**
 * Create a new super admin (or other admin role).
 * Only accessible by existing super_admin users via RBAC middleware.
 */
async function adminCreate(req, res) {
  // Validate payload
  const parseResult = createAdminSchema.safeParse(req.body);
  if (!parseResult.success) {
    return res.status(400).json({ success: false, message: 'Invalid request body', errors: parseResult.error.errors });
  }
  const { email, password, name, role = 'super_admin', organizationId } = parseResult.data;

  // Normalise email
  const normalizedEmail = String(email).trim().toLowerCase();

  // Check for existing email
  const existing = await prisma.user.findUnique({ where: { email: normalizedEmail } });
  if (existing) {
    return res.status(409).json({ success: false, message: 'Email already exists' });
  }

  // Hash password
  const passwordHash = await bcrypt.hash(String(password), 10);

  // Build data payload for Prisma
  const data = {
    email: normalizedEmail,
    passwordHash,
    role,
    isActive: true,
    name: name || null,
  };
  if (organizationId) data.organizationId = organizationId;

  try {
    const user = await prisma.user.create({ data });
    return res.status(201).json({
      success: true,
      message: 'Admin user created',
      data: { id: user.id, email: user.email, role: user.role, organizationId: user.organizationId },
    });
  } catch (err) {
    console.error('Admin creation error:', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
}

module.exports = { adminCreate };
