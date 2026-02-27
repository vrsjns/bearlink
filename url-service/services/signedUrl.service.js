const crypto = require('crypto');
const { createLogger } = require('shared/utils/logger');

const logger = createLogger('url-service');

const ALGORITHM = 'sha256';
const SIG_PARAM = 'sig';
const EXP_PARAM = 'exp';
const DEFAULT_TTL = 3600; // 1 hour

/**
 * Sign a short URL with an HMAC-SHA256 signature.
 * Appends ?sig=<hex>&exp=<unix-timestamp> to the URL.
 *
 * @param {string} shortUrl - The full short URL (e.g. https://brl.ink/abc1234567)
 * @param {string} secret   - HMAC secret (from URL_SIGNING_SECRET env var)
 * @param {number} [ttlSeconds=3600] - Validity window in seconds
 * @returns {string} Signed URL
 */
const signUrl = (shortUrl, secret, ttlSeconds = DEFAULT_TTL) => {
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  const payload = `${shortUrl}:${exp}`;
  const sig = crypto.createHmac(ALGORITHM, secret).update(payload).digest('hex');

  const url = new URL(shortUrl);
  url.searchParams.set(EXP_PARAM, String(exp));
  url.searchParams.set(SIG_PARAM, sig);
  return url.toString();
};

/**
 * Verify a signed URL.
 *
 * @param {string} shortUrl - The base short URL WITHOUT sig/exp query params
 * @param {string} sig      - Signature from query string
 * @param {string} exp      - Expiry timestamp from query string
 * @param {string} secret   - HMAC secret
 * @returns {{ valid: boolean, reason?: string }}
 */
const verifyUrl = (shortUrl, sig, exp, secret) => {
  if (!sig || !exp) {
    return { valid: false, reason: 'Missing signature or expiry.' };
  }

  const expNum = Number(exp);
  if (!Number.isInteger(expNum) || expNum <= 0) {
    return { valid: false, reason: 'Invalid expiry.' };
  }

  const now = Math.floor(Date.now() / 1000);
  if (expNum < now) {
    return { valid: false, reason: 'Signed URL has expired.' };
  }

  const payload = `${shortUrl}:${exp}`;
  const expected = crypto.createHmac(ALGORITHM, secret).update(payload).digest('hex');

  try {
    const sigBuf = Buffer.from(sig, 'hex');
    const expBuf = Buffer.from(expected, 'hex');
    if (sigBuf.length !== expBuf.length) {
      return { valid: false, reason: 'Invalid signature.' };
    }
    if (!crypto.timingSafeEqual(sigBuf, expBuf)) {
      return { valid: false, reason: 'Invalid signature.' };
    }
    return { valid: true };
  } catch {
    return { valid: false, reason: 'Invalid signature format.' };
  }
};

module.exports = { signUrl, verifyUrl, SIG_PARAM, EXP_PARAM };
