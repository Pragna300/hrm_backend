const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const cookieParser = require('cookie-parser');

const { env } = require('./config/env');

function createApp() {
  const app = express();

  // Build the list of allowed CORS origins.
  // FRONTEND_URL can be a comma-separated list of origins, e.g.:
  //   https://hrm-frontend-wheat.vercel.app,http://localhost:5173
  const rawOrigins = (env.FRONTEND_URL || 'http://localhost:5173')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);

  app.use(helmet());
  app.use(
    cors({
      origin: (requestOrigin, callback) => {
        // Allow requests with no origin (e.g. curl, mobile apps, Render health checks)
        if (!requestOrigin) return callback(null, true);
        if (rawOrigins.includes(requestOrigin)) return callback(null, true);
        // Allow any *.vercel.app preview URL for this project automatically
        if (/\.vercel\.app$/.test(requestOrigin)) return callback(null, true);
        callback(new Error(`CORS: origin '${requestOrigin}' not allowed`));
      },
      credentials: true,
    })
  );
  app.use(express.json());
  app.use(cookieParser(env.COOKIE_SECRET));

  const path = require('path');
  app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));

  app.get('/health', (req, res) => res.json({ ok: true }));

  return app;
}

module.exports = { createApp };


