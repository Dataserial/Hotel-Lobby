const crypto = require('crypto');

class ApiError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

const fail = (status, code, message) => { throw new ApiError(status, code, message); };
const asyncRoute = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const objectId = (v, field = 'id') => {
  if (typeof v !== 'string' || !/^[0-9a-f]{24}$/i.test(v)) fail(400, 'VALIDATION_ERROR', `${field} must be an ObjectId`);
  return v;
};
const body = (v, allowed, required = []) => {
  if (!v || typeof v !== 'object' || Array.isArray(v) ||
      Object.keys(v).some((k) => !allowed.includes(k)) ||
      required.some((k) => !Object.hasOwn(v, k)) || !Object.keys(v).length) {
    fail(400, 'VALIDATION_ERROR', 'Unexpected or missing fields');
  }
  return v;
};
const str = (v, field, max) => {
  if (typeof v !== 'string' || !v.trim() || v.trim().length > max) fail(400, 'VALIDATION_ERROR', `Invalid ${field}`);
  return v.trim();
};
const int = (v, field, min, max = Number.MAX_SAFE_INTEGER) => {
  if (!Number.isSafeInteger(v) || v < min || v > max) fail(400, 'VALIDATION_ERROR', `Invalid ${field}`);
  return v;
};
const bool = (v, field) => {
  if (typeof v !== 'boolean') fail(400, 'VALIDATION_ERROR', `Invalid ${field}`);
  return v;
};
const email = (v) => {
  const value = str(v, 'email', 254).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) fail(400, 'VALIDATION_ERROR', 'Invalid email');
  return value;
};
const page = (query, allowed = []) => {
  if (Object.keys(query).some((k) => !['page', 'limit', ...allowed].includes(k))) fail(400, 'VALIDATION_ERROR', 'Unexpected query field');
  const parse = (value, fallback, max) => {
    if (value === undefined) return fallback;
    if (typeof value !== 'string' || !/^[1-9]\d*$/.test(value) || Number(value) > max) fail(400, 'VALIDATION_ERROR', 'Invalid pagination');
    return Number(value);
  };
  const number = parse(query.page, 1, 1000000);
  const limit = parse(query.limit, 20, 100);
  return { skip: (number - 1) * limit, take: limit, page: number, limit };
};
const list = async (model, where, pagination, orderBy, select) => {
  const [total, items] = await Promise.all([
    model.count({ where }), model.findMany({ where, skip: pagination.skip, take: pagination.take, orderBy, ...(select ? { select } : {}) }),
  ]);
  return { items, page: pagination.page, limit: pagination.limit, total };
};
const requestId = (req, res, next) => {
  req.id = crypto.randomUUID();
  res.setHeader('X-Request-Id', req.id);
  next();
};
const errors = (err, req, res, _next) => {
  let status = err.status || 500;
  let code = err.code || 'INTERNAL_ERROR';
  let message = status >= 500 ? 'Internal server error' : err.message;
  if (err.code === 'P2002') { status = 409; code = 'DUPLICATE'; message = 'Value already exists'; }
  if (err.code === 'P2034') { status = 409; code = 'WRITE_CONFLICT'; message = 'Concurrent update conflict; retry the request'; }
  if (err.code === 'P2025') { status = 404; code = 'NOT_FOUND'; message = 'Record not found'; }
  if (err.type === 'entity.parse.failed' || err.type === 'entity.too.large') {
    status = 400; code = 'VALIDATION_ERROR'; message = 'Invalid JSON body';
  }
  if (status >= 500) console.error(`[${req.id}]`, err);
  res.status(status).json({ error: { code, message, requestId: req.id } });
};

module.exports = { ApiError, fail, asyncRoute, objectId, body, str, int, bool, email, page, list, requestId, errors };
