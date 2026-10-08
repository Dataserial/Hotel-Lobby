const { fail } = require('./http');

// Per-process, bounded limiter. Do not trust forwarded IPs without a trusted proxy.
function rateLimit({ limit, windowMs = 60000, maxKeys = 10000, clock = Date.now }) {
  const clients = new Map();
  return (req, res, next) => {
    const now = clock();
    for (const [key, value] of clients) if (value.until <= now) clients.delete(key);
    const key = req.ip;
    let entry = clients.get(key);
    if (!entry) {
      if (clients.size >= maxKeys) {
        res.set('Retry-After', String(Math.ceil(windowMs / 1000)));
        return next(Object.assign(new Error('Request limit reached'), { status: 429, code: 'RATE_LIMITED' }));
      }
      entry = { count: 0, until: now + windowMs };
      clients.set(key, entry);
    }
    if (++entry.count > limit) {
      res.set('Retry-After', String(Math.max(1, Math.ceil((entry.until - now) / 1000))));
      return next(Object.assign(new Error('Request limit reached'), { status: 429, code: 'RATE_LIMITED' }));
    }
    next();
  };
}

function headersAndLimits(req, res, next) {
  res.set({
    'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer',
    'X-Frame-Options': 'DENY', 'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
    'Cache-Control': 'no-store',
  });
  if (req.secure) res.set('Strict-Transport-Security', 'max-age=31536000');
  if (req.originalUrl.length > 4096) fail(414, 'URI_TOO_LONG', 'Request URL exceeds 4096 characters');
  next();
}

module.exports = { rateLimit, headersAndLimits };
