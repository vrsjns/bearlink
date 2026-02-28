const crypto = require('crypto');

/**
 * Generate a CSRF token tied to the user's JWT cookie.
 * Using HMAC(secret, jwtToken) makes the token stateless and unforgeable
 * without the JWT secret.
 */
const generateCsrfToken = (jwtToken, secret) => {
  return crypto.createHmac('sha256', secret).update(jwtToken).digest('hex');
};

/**
 * Verify a CSRF token against the expected value. Uses timing-safe comparison
 * to prevent timing attacks.
 */
const verifyCsrfToken = (csrfToken, jwtToken, secret) => {
  try {
    const expected = generateCsrfToken(jwtToken, secret);
    const a = Buffer.from(csrfToken, 'hex');
    const b = Buffer.from(expected, 'hex');
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
};

module.exports = { generateCsrfToken, verifyCsrfToken };
