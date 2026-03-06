import { describe, it, expect, beforeEach, vi } from 'vitest';

const { createRedisLoginAttemptStore } = require('../services/redisLoginAttemptStore');

const createMockRedis = () => ({
  incr: vi.fn(),
  set: vi.fn(),
  exists: vi.fn(),
  del: vi.fn(),
});

const createMockLogger = () => ({
  warn: vi.fn(),
});

describe('createRedisLoginAttemptStore', () => {
  let redis: ReturnType<typeof createMockRedis>;
  let logger: ReturnType<typeof createMockLogger>;
  let store: ReturnType<typeof createRedisLoginAttemptStore>;
  const email = 'user@example.com';

  beforeEach(() => {
    redis = createMockRedis();
    logger = createMockLogger();
    store = createRedisLoginAttemptStore(redis, logger);
  });

  describe('recordFailedAttempt', () => {
    it('increments login_attempts key', async () => {
      redis.incr.mockResolvedValue(1);
      await store.recordFailedAttempt(email);
      expect(redis.incr).toHaveBeenCalledWith(`login_attempts:${email}`);
    });

    it('does not set lock key when count is below threshold', async () => {
      redis.incr.mockResolvedValue(4);
      await store.recordFailedAttempt(email);
      expect(redis.set).not.toHaveBeenCalled();
    });

    it('sets lock key with NX EX when count reaches threshold', async () => {
      redis.incr.mockResolvedValue(5);
      await store.recordFailedAttempt(email);
      expect(redis.set).toHaveBeenCalledWith(`login_locked:${email}`, '1', 'NX', 'EX', 900);
    });

    it('sets lock key when count exceeds threshold', async () => {
      redis.incr.mockResolvedValue(6);
      await store.recordFailedAttempt(email);
      expect(redis.set).toHaveBeenCalledWith(`login_locked:${email}`, '1', 'NX', 'EX', 900);
    });

    it('logs warning and does not throw on Redis error', async () => {
      redis.incr.mockRejectedValue(new Error('connection refused'));
      await expect(store.recordFailedAttempt(email)).resolves.toBeUndefined();
      expect(logger.warn).toHaveBeenCalled();
    });
  });

  describe('isLocked', () => {
    it('returns true when lock key exists', async () => {
      redis.exists.mockResolvedValue(1);
      expect(await store.isLocked(email)).toBe(true);
      expect(redis.exists).toHaveBeenCalledWith(`login_locked:${email}`);
    });

    it('returns false when lock key does not exist', async () => {
      redis.exists.mockResolvedValue(0);
      expect(await store.isLocked(email)).toBe(false);
    });

    it('logs warning and returns false on Redis error', async () => {
      redis.exists.mockRejectedValue(new Error('connection refused'));
      expect(await store.isLocked(email)).toBe(false);
      expect(logger.warn).toHaveBeenCalled();
    });
  });

  describe('clearAttempts', () => {
    it('deletes both keys in a single DEL call', async () => {
      redis.del.mockResolvedValue(2);
      await store.clearAttempts(email);
      expect(redis.del).toHaveBeenCalledWith(`login_attempts:${email}`, `login_locked:${email}`);
    });

    it('logs warning and does not throw on Redis error', async () => {
      redis.del.mockRejectedValue(new Error('connection refused'));
      await expect(store.clearAttempts(email)).resolves.toBeUndefined();
      expect(logger.warn).toHaveBeenCalled();
    });
  });
});
