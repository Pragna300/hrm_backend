require('dotenv').config();
process.env.DATABASE_URL = process.env.DATABASE_URL ?? process.env.DIRECT_URL;
const { z } = require('zod');

const normalizeEnvString = (value) => {
  if (value === '' || value === undefined || value === null) return undefined;
  const str = String(value).trim();
  return str.replace(/^['"](.*)['"]$/s, '$1');
};

const parseNumberEnv = (value) => {
  const normalized = normalizeEnvString(value);
  if (normalized === undefined) return undefined;
  const num = Number(normalized);
  return Number.isFinite(num) ? num : undefined;
};

const EnvSchema = z.object({
  NODE_ENV: z.string().default('development'),
  PORT: z.preprocess(parseNumberEnv, z.number().int().positive().default(5000)),

  DATABASE_URL: z.preprocess(normalizeEnvString, z.string().min(1, { message: 'DATABASE_URL is required' }).refine(
    (value) => /^(postgres|postgresql):\/\//.test(value),
    { message: 'DATABASE_URL must start with postgres:// or postgresql://' }
  )),

  JWT_SECRET: z.string().default('shnoor_secret_2026'),
  JWT_ACCESS_EXPIRY: z.string().default('15m'),
  JWT_REFRESH_EXPIRY: z.string().default('7d'),

  FRONTEND_URL: z.string().default('http://localhost:3000'),
  COOKIE_SECRET: z.string().default('dev_cookie_secret_change_me'),

  SMTP_HOST: z.string().default('smtp.gmail.com'),
  SMTP_PORT: z.preprocess(parseNumberEnv, z.number().int().positive().default(587)),
  SMTP_SECURE: z.preprocess((value) => {
    if (value === '' || value === undefined || value === null) return 'false';
    return value;
  },
    z.string()
      .default('false')
      .transform((value) => value === 'true')),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_FROM: z.string().optional(),
  RESEND_FROM: z.string().optional(),
  RESEND_API_KEY: z.string().optional(),
  // Stripe configuration (required for payments and webhooks
  STRIPE_SECRET_KEY: z.string().min(1, { message: 'STRIPE_SECRET_KEY is required' }),
  STRIPE_WEBHOOK_SECRET: z.string().min(1, { message: 'STRIPE_WEBHOOK_SECRET is required' }),
  STRIPE_ACCOUNT_ID: z.string().optional(),
});


const env = EnvSchema.parse(process.env);

module.exports = { env };

