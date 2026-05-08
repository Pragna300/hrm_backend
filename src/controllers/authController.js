const bcrypt = require('bcrypt');
const { prisma } = require('../config/database');
const { ok, fail, asyncHandler } = require('../utils/response');
const { signAuthToken } = require('../lib/token');
const { userWithEmployeeInclude, buildAuthUserPayload } = require('../lib/authPayload');
const { provisionCompany } = require('../services/onboarding');
const { createBootstrapSuperAdmin } = require('../lib/adminBootstrap');
const {
  registerCompanySchema,
  loginSchema,
  bootstrapSchema,
} = require('../validators/authSchemas');

const registerCompany = asyncHandler(async (req, res) => {
  const parsed = registerCompanySchema.safeParse(req.body);
  if (!parsed.success) {
    return fail(res, parsed.error.issues[0]?.message || 'Invalid input', 400);
  }
  await provisionCompany(parsed.data);
  return ok(res, { message: 'Company registered. Please log in as the manager.' }, 201);
});

const login = asyncHandler(async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) return fail(res, 'Email and password are required');

  const { email, password } = parsed.data;
  const normalizedEmail = String(email).trim().toLowerCase();

  const user = await prisma.user.findUnique({
    where: { email: normalizedEmail },
    include: userWithEmployeeInclude,
  });
  if (!user || !user.isActive) {
    return fail(res, 'Invalid credentials', 400);
  }

  const passwordOk = await bcrypt.compare(password, user.passwordHash);
  if (!passwordOk) return fail(res, 'Invalid credentials', 400);

  if (user.organizationId && user.organization?.status === 'suspended') {
    return fail(res, 'Your company account is suspended. Contact platform support.', 403);
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date() },
  });

  const token = signAuthToken(user);
  return ok(res, { token, user: buildAuthUserPayload(user) });
});

const me = asyncHandler(async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user.userId },
    include: userWithEmployeeInclude,
  });
  if (!user) return fail(res, 'User not found', 404);
  return ok(res, { user: buildAuthUserPayload(user) });
});

const bootstrapSuperAdmin = asyncHandler(async (req, res) => {
  const parsed = bootstrapSchema.safeParse(req.body);
  if (!parsed.success) return fail(res, 'Invalid input', 400);

  const result = await createBootstrapSuperAdmin(parsed.data);
  return res.status(result.statusCode).json({
    success: result.success,
    message: result.message,
    data: result.data || null,
  });
});

module.exports = { registerCompany, login, me, bootstrapSuperAdmin };
