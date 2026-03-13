const rateLimit = require('express-rate-limit');
const { RedisStore } = require('rate-limit-redis');

/**
 * Create Redis-backed rate limiters.
 * Each limiter gets its own RedisStore instance (required by rate-limit-redis).
 * @param {import('ioredis').Redis} redisClient
 * @returns {{ apiLimiter, redirectLimiter }}
 */
const createRedisRateLimiters = (redisClient) => {
  const makeStore = (prefix) =>
    new RedisStore({
      prefix,
      sendCommand: (...args) => redisClient.call(...args),
    });

  const apiLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 100,
    message: { error: 'Too many requests, please try again later.' },
    standardHeaders: true,
    legacyHeaders: false,
    store: makeStore('rl:api:'),
  });

  const redirectLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 200,
    message: { error: 'Too many redirect requests, please try again later.' },
    standardHeaders: true,
    legacyHeaders: false,
    store: makeStore('rl:redirect:'),
  });

  return { apiLimiter, redirectLimiter };
};

module.exports = { createRedisRateLimiters };
