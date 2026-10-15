// ตรวจข้อกำหนดของรหัสผ่าน
const { fail } = require('./http');

// รักษารหัสผ่านเดิม และตรวจขีดจำกัด bcrypt เป็นไบต์ UTF-8
// ตรวจความยาวรหัสผ่านตามจำนวนไบต์ที่ bcrypt รองรับ
function password(value, { setting = true } = {}) {
  if (typeof value !== 'string' || !value.length || value.length > 128 ||
      Buffer.byteLength(value, 'utf8') > 72 || (setting && value.length < 12)) {
    fail(400, 'PASSWORD_POLICY', 'Password must be at least 12 characters and at most 72 UTF-8 bytes');
  }
  return value;
}
module.exports = { password };
