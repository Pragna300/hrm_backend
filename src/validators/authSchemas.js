const { z } = require('zod');

const registerCompanySchema = z.object({
  companyName:    z.string().min(2, 'Company name is required'),
  companyAddress: z.string().optional().nullable(),
  sector:         z.string().optional().nullable(),
  contactPhone:   z.string().optional().nullable(),
  managerName:    z.string().min(2, 'Manager name is required'),
  email:          z.string().email('Valid email required'),
  password:       z.string().min(6, 'Password must be at least 6 chars'),
  planSlug:       z.string().optional(),
  billingCycle:   z.enum(['monthly', 'yearly']).optional(),
});

const loginSchema = z.object({
  email:    z.string().email('Valid email required'),
  password: z.string().min(1, 'Password is required'),
});

const bootstrapSchema = z.object({
  email:    z.string().email().optional(),
  password: z.string().min(6).optional(),
  name:     z.string().optional(),
});

const forgotPasswordSchema = z.object({
  email: z.string().email('Valid email required'),
});

const resetPasswordSchema = z.object({
  token: z.string().min(1, 'Token is required'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
});

module.exports = {
  registerCompanySchema,
  loginSchema,
  bootstrapSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
};
