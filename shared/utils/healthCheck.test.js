import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { healthHandler, createReadinessHandler } from './healthCheck';

describe('Health Check Utils', () => {
  let req;
  let res;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-01-15T12:00:00.000Z'));

    req = {};
    res = {
      json: vi.fn(),
      status: vi.fn().mockReturnThis(),
    };
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('healthHandler', () => {
    it('should return healthy status with timestamp', () => {
      healthHandler(req, res);

      expect(res.json).toHaveBeenCalledWith({
        status: 'healthy',
        timestamp: '2024-01-15T12:00:00.000Z',
      });
    });
  });

  describe('createReadinessHandler', () => {
    it('should return ready status when all checks pass', async () => {
      const checks = {
        database: vi.fn().mockResolvedValue(undefined),
        rabbitmq: vi.fn().mockResolvedValue(undefined),
      };

      const handler = createReadinessHandler(checks);
      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        status: 'ready',
        timestamp: '2024-01-15T12:00:00.000Z',
        checks: {
          database: 'healthy',
          rabbitmq: 'healthy',
        },
      });
    });

    it('should return not_ready status when a check fails', async () => {
      const checks = {
        database: vi.fn().mockResolvedValue(undefined),
        rabbitmq: vi.fn().mockRejectedValue(new Error('Connection failed')),
      };

      const handler = createReadinessHandler(checks);
      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(503);
      expect(res.json).toHaveBeenCalledWith({
        status: 'not_ready',
        timestamp: '2024-01-15T12:00:00.000Z',
        checks: {
          database: 'healthy',
          rabbitmq: 'unhealthy',
        },
      });
    });

    it('should return not_ready when all checks fail', async () => {
      const checks = {
        database: vi.fn().mockRejectedValue(new Error('DB down')),
        cache: vi.fn().mockRejectedValue(new Error('Cache down')),
      };

      const handler = createReadinessHandler(checks);
      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(503);
      expect(res.json).toHaveBeenCalledWith({
        status: 'not_ready',
        timestamp: '2024-01-15T12:00:00.000Z',
        checks: {
          database: 'unhealthy',
          cache: 'unhealthy',
        },
      });
    });

    it('should handle empty checks object', async () => {
      const handler = createReadinessHandler({});
      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        status: 'ready',
        timestamp: '2024-01-15T12:00:00.000Z',
        checks: {},
      });
    });

    it('should run all checks even if some fail early', async () => {
      const check1 = vi.fn().mockRejectedValue(new Error('fail'));
      const check2 = vi.fn().mockResolvedValue(undefined);
      const check3 = vi.fn().mockRejectedValue(new Error('fail'));

      const checks = { check1, check2, check3 };
      const handler = createReadinessHandler(checks);
      await handler(req, res);

      expect(check1).toHaveBeenCalled();
      expect(check2).toHaveBeenCalled();
      expect(check3).toHaveBeenCalled();
    });
  });
});
