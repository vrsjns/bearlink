import { describe, it, expect, vi, beforeEach } from 'vitest';
import { authLimiter, apiLimiter, redirectLimiter } from './rateLimit';

describe('Rate Limit Middleware', () => {
  let req;
  let res;
  let next;

  beforeEach(() => {
    // Create a proper Express-like request with app object
    req = {
      ip: '127.0.0.1',
      headers: {},
      app: {
        get: vi.fn().mockReturnValue(false), // trust proxy = false
      },
    };
    res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
      setHeader: vi.fn(),
      set: vi.fn(),
      get: vi.fn(),
      getHeader: vi.fn(),
    };
    next = vi.fn();
  });

  describe('authLimiter', () => {
    it('should be a function', () => {
      expect(typeof authLimiter).toBe('function');
    });

    it('should allow requests under limit', async () => {
      // Use unique IP to avoid conflicts with other tests
      req.ip = '10.0.0.1';
      await authLimiter(req, res, next);
      expect(next).toHaveBeenCalled();
    });
  });

  describe('apiLimiter', () => {
    it('should be a function', () => {
      expect(typeof apiLimiter).toBe('function');
    });

    it('should allow requests under limit', async () => {
      req.ip = '10.0.0.2';
      await apiLimiter(req, res, next);
      expect(next).toHaveBeenCalled();
    });
  });

  describe('redirectLimiter', () => {
    it('should be a function', () => {
      expect(typeof redirectLimiter).toBe('function');
    });

    it('should allow requests under limit', async () => {
      req.ip = '10.0.0.3';
      await redirectLimiter(req, res, next);
      expect(next).toHaveBeenCalled();
    });
  });

  describe('rate limit behavior', () => {
    it('all limiters should export middleware functions', () => {
      expect(typeof authLimiter).toBe('function');
      expect(typeof apiLimiter).toBe('function');
      expect(typeof redirectLimiter).toBe('function');
    });

    it('limiters should call next on valid requests', async () => {
      const next1 = vi.fn();
      const next2 = vi.fn();
      const next3 = vi.fn();

      // Use different IPs to avoid rate limit conflicts
      const createReq = (ip) => ({
        ip,
        headers: {},
        app: { get: vi.fn().mockReturnValue(false) },
      });

      await authLimiter(createReq('192.168.1.1'), res, next1);
      await apiLimiter(createReq('192.168.1.2'), res, next2);
      await redirectLimiter(createReq('192.168.1.3'), res, next3);

      expect(next1).toHaveBeenCalled();
      expect(next2).toHaveBeenCalled();
      expect(next3).toHaveBeenCalled();
    });
  });
});
