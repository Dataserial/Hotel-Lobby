const { isIP } = require('net');

function trustedProxies(value = '') {
  if (!value.trim()) return false;
  const ranges = value.split(',').map(v => v.trim());
  for (const range of ranges) {
    const [address, prefix, extra] = range.split('/');
    const family = isIP(address);
    if (!family || extra !== undefined || (prefix !== undefined && (!/^\d+$/.test(prefix) || Number(prefix) < 1 || Number(prefix) > (family === 4 ? 32 : 128)))) {
      throw new Error('TRUSTED_PROXY_CIDRS must contain explicit IP addresses or non-global CIDRs');
    }
  }
  return ranges;
}
module.exports = { trustedProxies };
