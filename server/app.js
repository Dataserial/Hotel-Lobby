const express = require('express');
const prisma = require('./lib/prisma');
const { requestId, errors } = require('./lib/http');
const { requireAuth } = require('./lib/auth');

function createApp(db = prisma) {
  const app = express();
  app.disable('x-powered-by');
  app.use(requestId);
  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    const origins = (process.env.CORS_ORIGINS || '').split(',').map((x) => x.trim()).filter(Boolean);
    const origin = req.get('origin');
    if (origin && origins.includes(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
      res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
    }
    if (req.method === 'OPTIONS') return res.status(204).end();
    next();
  });
  app.use(express.json({ limit: '64kb' }));
  app.get('/health', (_req, res) => res.json({ status: 'ok' }));
  app.use('/api/auth', require('./routes/api-auth')(db));
  app.use('/api', requireAuth(db));
  app.use('/api/users', require('./routes/api-users')(db));
  app.use('/api/room-types', require('./routes/api-room-types')(db));
  app.use('/api/rooms', require('./routes/api-rooms')(db));
  app.use('/api/guests', require('./routes/api-guests')(db));
  app.use((req, res) => res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Route not found', requestId: req.id } }));
  app.use(errors);
  return app;
}

module.exports = createApp();
module.exports.createApp = createApp;
