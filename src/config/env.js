require('dotenv').config();
const { z } = require('zod');

const EnvSchema = z.object({
  NODE_ENV: z.string().default('development'),
  PORT: z.coerce.number().int().positive().default(5000),

  DATABASE_URL: z.string().optional(),

  JWT_SECRET: z.string().optional(),
  JWT_ACCESS_EXPIRY: z.string().default('15m'),
  JWT_REFRESH_EXPIRY: z.string().default('7d'),

  FRONTEND_URL: z.string().default('http://localhost:3000'),
  COOKIE_SECRET: z.string().default('dev_cookie_secret_change_me'),
});

const env = EnvSchema.parse(process.env);

module.exports = { env };

