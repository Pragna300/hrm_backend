const bcrypt = require('bcrypt');
const crypto = require('crypto');
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
  forgotPasswordSchema,
  resetPasswordSchema,
} = require('../validators/authSchemas');
const { sendPasswordReset } = require('../lib/mailer');
const { env } = require('../config/env');

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

const forgotPassword = asyncHandler(async (req, res) => {
  const parsed = forgotPasswordSchema.safeParse(req.body);
  if (!parsed.success) return fail(res, parsed.error.issues[0]?.message || 'Invalid email', 400);

  const { email } = parsed.data;
  const user = await prisma.user.findUnique({
    where: { email: email.toLowerCase().trim() },
    include: { employee: true },
  });

  // Security: always return "ok" even if user doesn't exist to prevent email enumeration
  if (!user) {
    return ok(res, { message: 'If an account exists with this email, a reset link has been sent.' });
  }

  const token = crypto.randomBytes(32).toString('hex');
  const expires = new Date(Date.now() + 3600000); // 1 hour

  await prisma.user.update({
    where: { id: user.id },
    data: {
      resetToken: token,
      resetTokenExpires: expires,
    },
  });

  const resetLink = `${env.FRONTEND_URL}/reset-password?token=${token}`;
  await sendPasswordReset({
    to: user.email,
    fullName: user.employee ? `${user.employee.firstName} ${user.employee.lastName}` : 'User',
    resetLink,
  });

  return ok(res, { message: 'If an account exists with this email, a reset link has been sent.' });
});

const resetPassword = asyncHandler(async (req, res) => {
  const parsed = resetPasswordSchema.safeParse(req.body);
  if (!parsed.success) return fail(res, parsed.error.issues[0]?.message || 'Invalid input', 400);

  const { token, password } = parsed.data;

  const user = await prisma.user.findFirst({
    where: {
      resetToken: token,
      resetTokenExpires: { gt: new Date() },
    },
  });

  if (!user) {
    return fail(res, 'Invalid or expired reset token', 400);
  }

  const passwordHash = await bcrypt.hash(password, 10);

  await prisma.user.update({
    where: { id: user.id },
    data: {
      passwordHash,
      resetToken: null,
      resetTokenExpires: null,
    },
  });

  return ok(res, { message: 'Password has been reset successfully. You can now log in.' });
});

module.exports = {
  registerCompany,
  login,
  me,
  bootstrapSuperAdmin,
  forgotPassword,
  resetPassword,
};
