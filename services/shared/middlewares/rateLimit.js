const rateLimit = require('express-rate-limit');

/**
 * Rate limiter for authentication endpoints (login/register)
 * 5 requests per 15 minutes
 */
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5,
  message: { error: 'Too many authentication attempts, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * Rate limiter for general API endpoints
 * 100 requests per minute
 */
const apiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100,
  message: { error: 'Too many requests, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * Rate limiter for URL redirects
 * 200 requests per minute
 */
const redirectLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 200,
  message: { error: 'Too many redirect requests, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

module.exports = {
  authLimiter,
  apiLimiter,
  redirectLimiter,
};
