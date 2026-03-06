const LOCK_THRESHOLD = 5;
const LOCK_TTL_SECONDS = 900;

const createRedisLoginAttemptStore = (redisClient, logger) => {
  const isLocked = async (email) => {
    try {
      const result = await redisClient.exists(`login_locked:${email}`);
      return result === 1;
    } catch (err) {
      logger.warn('Redis unavailable in isLocked, degrading to unlocked', { error: err.message });
      return false;
    }
  };

  const recordFailedAttempt = async (email) => {
    try {
      const count = await redisClient.incr(`login_attempts:${email}`);
      if (count >= LOCK_THRESHOLD) {
        await redisClient.set(`login_locked:${email}`, '1', 'NX', 'EX', LOCK_TTL_SECONDS);
      }
    } catch (err) {
      logger.warn('Redis unavailable in recordFailedAttempt, skipping', { error: err.message });
    }
  };

  const clearAttempts = async (email) => {
    try {
      await redisClient.del(`login_attempts:${email}`, `login_locked:${email}`);
    } catch (err) {
      logger.warn('Redis unavailable in clearAttempts, skipping', { error: err.message });
    }
  };

  return { isLocked, recordFailedAttempt, clearAttempts };
};

module.exports = { createRedisLoginAttemptStore };
