import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createCorrelationIdMiddleware,
  correlationIdMiddleware,
  CORRELATION_ID_HEADER,
} from './correlationId';

describe('CorrelationId Middleware', () => {
  let req;
  let res;

  beforeEach(() => {
    req = {
      headers: {},
    };
    res = {
      setHeader: vi.fn(),
    };
  });

  describe('CORRELATION_ID_HEADER', () => {
    it('should be x-correlation-id', () => {
      expect(CORRELATION_ID_HEADER).toBe('x-correlation-id');
    });
  });

  describe('correlationIdMiddleware', () => {
    it('should generate a correlation ID when none is provided', () => {
      const next = vi.fn();

      correlationIdMiddleware(req, res, next);

      expect(req.correlationId).toBeDefined();
      expect(req.correlationId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
      expect(res.setHeader).toHaveBeenCalledWith('x-correlation-id', req.correlationId);
      expect(next).toHaveBeenCalled();
    });

    it('should use existing correlation ID from header', () => {
      req.headers['x-correlation-id'] = 'existing-id-123';
      const next = vi.fn();

      correlationIdMiddleware(req, res, next);

      expect(req.correlationId).toBe('existing-id-123');
      expect(res.setHeader).toHaveBeenCalledWith('x-correlation-id', 'existing-id-123');
      expect(next).toHaveBeenCalled();
    });

    it('should generate unique IDs for each request', () => {
      const req1 = { headers: {} };
      const req2 = { headers: {} };
      const res1 = { setHeader: vi.fn() };
      const res2 = { setHeader: vi.fn() };
      const next = vi.fn();

      correlationIdMiddleware(req1, res1, next);
      correlationIdMiddleware(req2, res2, next);

      expect(req1.correlationId).not.toBe(req2.correlationId);
    });
  });

  describe('createCorrelationIdMiddleware', () => {
    it('should create middleware function', () => {
      const middleware = createCorrelationIdMiddleware('test-service');

      expect(typeof middleware).toBe('function');
    });

    it('should generate a correlation ID when none is provided', () => {
      const middleware = createCorrelationIdMiddleware('auth-service');
      const next = vi.fn();

      middleware(req, res, next);

      expect(req.correlationId).toBeDefined();
      expect(req.correlationId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
      expect(res.setHeader).toHaveBeenCalledWith('x-correlation-id', req.correlationId);
      expect(next).toHaveBeenCalled();
    });

    it('should use existing correlation ID from header', () => {
      const middleware = createCorrelationIdMiddleware('url-service');
      req.headers['x-correlation-id'] = 'propagated-id';
      const next = vi.fn();

      middleware(req, res, next);

      expect(req.correlationId).toBe('propagated-id');
      expect(res.setHeader).toHaveBeenCalledWith('x-correlation-id', 'propagated-id');
    });

    it('should call next for authenticated users', () => {
      const middleware = createCorrelationIdMiddleware('test-service');
      req.user = { id: 42 };
      const next = vi.fn();

      middleware(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(req.correlationId).toBeDefined();
    });

    it('should call next for unauthenticated users', () => {
      const middleware = createCorrelationIdMiddleware('test-service');
      const next = vi.fn();

      middleware(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(req.correlationId).toBeDefined();
    });

    it('should generate unique correlation IDs for different requests', () => {
      const middleware = createCorrelationIdMiddleware('test-service');
      const req1 = { headers: {} };
      const req2 = { headers: {} };
      const res1 = { setHeader: vi.fn() };
      const res2 = { setHeader: vi.fn() };
      const next = vi.fn();

      middleware(req1, res1, next);
      middleware(req2, res2, next);

      expect(req1.correlationId).not.toBe(req2.correlationId);
    });
  });
});
