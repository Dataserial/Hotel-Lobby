const { fail } = require('./http');

// Preserve the credential exactly. bcrypt's limit is UTF-8 bytes, not characters.
function password(value, { setting = true } = {}) {
  if (typeof value !== 'string' || !value.length || value.length > 128 ||
      Buffer.byteLength(value, 'utf8') > 72 || (setting && value.length < 12)) {
    fail(400, 'PASSWORD_POLICY', 'Password must be at least 12 characters and at most 72 UTF-8 bytes');
  }
  return value;
}
module.exports = { password };
