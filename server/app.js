const express = require('express');
const prisma = require('./lib/prisma');
const { requestId, errors } = require('./lib/http');
const { requireAuth } = require('./lib/auth');
const { rateLimit, headersAndLimits } = require('./lib/security');

function createApp(db = prisma) {
  const app = express();
  app.disable('x-powered-by');
  app.set('query parser', 'simple');
  app.locals.draining = false;
  app.use(requestId);
  app.use(headersAndLimits);
  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    const publicRequest = req.path.startsWith('/api/public/');
    const origins = (process.env[publicRequest ? 'PUBLIC_CORS_ORIGINS' : 'CORS_ORIGINS'] || '').split(',').map((x) => x.trim()).filter(Boolean);
    const origin = req.get('origin');
    if (origin && origins.includes(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
      res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, Idempotency-Key');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
    }
    if (req.method === 'OPTIONS') return res.status(204).end();
    next();
  });
  app.use(express.json({ limit: '64kb' }));
  app.get('/health', (_req, res) => res.json({ status: 'ok' }));
  app.get('/ready', async (req, res) => {
    if (app.locals.draining) return res.status(503).json({ status: 'unavailable' });
    let timer;
    try {
      await Promise.race([db.$runCommandRaw({ ping: 1 }), new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('Readiness timeout')), 2000);
        timer.unref();
      })]);
      res.json({ status: 'ready' });
    } catch { res.status(503).json({ status: 'unavailable' }); }
    finally { clearTimeout(timer); }
  });
  app.use('/api/public/rooms/availability', rateLimit({ limit: 60 }), require('./routes/api-availability')(db, { publicAccess: true }));
  app.use('/api/auth/login', rateLimit({ limit: 20, windowMs: 900000 }));
  app.use('/api/auth', require('./routes/api-auth')(db));
  app.use('/api', requireAuth(db));
  app.use('/api/dashboard', require('./routes/api-dashboard')(db));
  app.use('/api/users', require('./routes/api-users')(db));
  app.use('/api/room-types', require('./routes/api-room-types')(db));
  app.use('/api/rooms/availability', require('./routes/api-availability')(db));
  app.use('/api/rooms', require('./routes/api-rooms')(db));
  app.use('/api/guests', require('./routes/api-guests')(db));
  app.use('/api/bookings', require('./routes/api-bookings')(db));
  app.use('/api/bookings', require('./routes/api-operations')(db));
  app.use((req, res) => res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Route not found', requestId: req.id } }));
  app.use(errors);
  return app;
}

module.exports = createApp();
module.exports.createApp = createApp;
