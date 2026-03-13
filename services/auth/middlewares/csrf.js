const { verifyCsrfToken } = require('../services/csrf.service');

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * CSRF protection middleware.
 * Only applies to state-mutating requests that use cookie-based auth.
 * Requests using Bearer token (API clients) are exempt — they can't be
 * CSRF-attacked because browsers don't send Authorization headers automatically.
 */
const csrfMiddleware = (req, res, next) => {
  if (!MUTATING_METHODS.has(req.method)) return next();
  if (!req.cookies?.token) return next(); // Bearer or unauthenticated — skip

  const csrfToken = req.headers['x-csrf-token'];
  if (!csrfToken) {
    return res.status(403).json({ error: 'CSRF token missing.' });
  }

  if (!verifyCsrfToken(csrfToken, req.cookies.token, process.env.JWT_SECRET)) {
    return res.status(403).json({ error: 'Invalid CSRF token.' });
  }

  next();
};

module.exports = { csrfMiddleware };
