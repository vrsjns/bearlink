import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createRequestLogger } from './requestLogger';

describe('Request Logger Middleware', () => {
  let req;
  let res;
  let next;
  let originalEnd;

  beforeEach(() => {
    originalEnd = vi.fn();

    req = {
      method: 'GET',
      originalUrl: '/api/test',
      url: '/api/test',
      get: vi.fn((header) => {
        if (header === 'user-agent') return 'test-agent';
        return undefined;
      }),
    };

    res = {
      statusCode: 200,
      end: originalEnd,
      get: vi.fn((header) => {
        if (header === 'content-length') return '100';
        return undefined;
      }),
    };

    next = vi.fn();
  });

  describe('createRequestLogger', () => {
    it('should create a middleware function', () => {
      const middleware = createRequestLogger('test-service');
      expect(typeof middleware).toBe('function');
    });

    it('should call next immediately', () => {
      const middleware = createRequestLogger('test-service');
      middleware(req, res, next);
      expect(next).toHaveBeenCalled();
    });

    it('should override res.end', () => {
      const middleware = createRequestLogger('test-service');
      middleware(req, res, next);

      // res.end should be overridden
      expect(res.end).not.toBe(originalEnd);
    });

    it('should restore original res.end after calling it', () => {
      const middleware = createRequestLogger('test-service');
      middleware(req, res, next);

      res.end();

      // After calling end, it should be restored to original
      expect(res.end).toBe(originalEnd);
    });

    it('should call original end with chunk and encoding', () => {
      const middleware = createRequestLogger('test-service');
      middleware(req, res, next);

      const chunk = 'test data';
      const encoding = 'utf-8';
      res.end(chunk, encoding);

      expect(originalEnd).toHaveBeenCalledWith(chunk, encoding);
    });

    it('should work with different status codes', () => {
      const middleware = createRequestLogger('test-service');

      // Test 200
      middleware(req, res, next);
      res.statusCode = 200;
      res.end();
      expect(originalEnd).toHaveBeenCalled();

      // Reset for 404
      originalEnd.mockClear();
      res.end = originalEnd;
      middleware(req, res, vi.fn());
      res.statusCode = 404;
      res.end();
      expect(originalEnd).toHaveBeenCalled();

      // Reset for 500
      originalEnd.mockClear();
      res.end = originalEnd;
      middleware(req, res, vi.fn());
      res.statusCode = 500;
      res.end();
      expect(originalEnd).toHaveBeenCalled();
    });

    it('should handle requests with user', () => {
      req.user = { id: 42 };
      const middleware = createRequestLogger('test-service');
      middleware(req, res, next);

      // Should not throw
      res.end();
      expect(originalEnd).toHaveBeenCalled();
    });

    it('should handle requests with correlationId', () => {
      req.correlationId = 'test-correlation-id';
      const middleware = createRequestLogger('test-service');
      middleware(req, res, next);

      // Should not throw
      res.end();
      expect(originalEnd).toHaveBeenCalled();
    });

    it('should use req.url as fallback when originalUrl is not set', () => {
      req.originalUrl = undefined;
      req.url = '/fallback-url';
      const middleware = createRequestLogger('test-service');
      middleware(req, res, next);

      // Should not throw
      res.end();
      expect(originalEnd).toHaveBeenCalled();
    });
  });
});
