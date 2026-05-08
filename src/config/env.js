require('dotenv').config();
const { z } = require('zod');

const EnvSchema = z.object({
  NODE_ENV: z.string().default('development'),
  PORT: z.coerce.number().int().positive().default(5000),

  DATABASE_URL: z.string().optional(),

  JWT_SECRET: z.string().default('shnoor_secret_2026'),
  JWT_ACCESS_EXPIRY: z.string().default('15m'),
  JWT_REFRESH_EXPIRY: z.string().default('7d'),

  FRONTEND_URL: z.string().default('http://localhost:3000'),
  COOKIE_SECRET: z.string().default('dev_cookie_secret_change_me'),

  SMTP_HOST: z.string().default('smtp.gmail.com'),
  SMTP_PORT: z.coerce.number().int().positive().default(587),
  SMTP_SECURE: z
    .string()
    .default('false')
    .transform((value) => value === 'true'),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_FROM: z.string().default('khaleel@shnoor.com'),
});

const env = EnvSchema.parse(process.env);

module.exports = { env };

