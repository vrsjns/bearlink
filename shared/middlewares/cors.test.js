import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { corsMiddleware } from './cors';

// Helper to create a mock Express response with methods required by cors library
const createMockRes = () => {
  const headers = {};
  return {
    setHeader: vi.fn((key, value) => {
      headers[key] = value;
    }),
    getHeader: vi.fn((key) => headers[key]),
    end: vi.fn(),
    statusCode: 200,
    _headers: headers,
  };
};

describe('CORS Middleware', () => {
  let req;
  let res;
  let next;
  let originalEnv;

  beforeEach(() => {
    originalEnv = process.env.ALLOWED_ORIGINS;
    req = {
      method: 'GET',
      headers: {},
    };
    res = createMockRes();
    next = vi.fn();
  });

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env.ALLOWED_ORIGINS = originalEnv;
    } else {
      delete process.env.ALLOWED_ORIGINS;
    }
  });

  it('should allow requests with no origin (like curl)', () => {
    // No origin header - simulating curl or server-to-server
    corsMiddleware(req, res, next);

    expect(next).toHaveBeenCalled();
  });

  it('should allow requests from default localhost:3000', () => {
    req.headers.origin = 'http://localhost:3000';

    corsMiddleware(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(res.setHeader).toHaveBeenCalledWith('Access-Control-Allow-Origin', 'http://localhost:3000');
  });

  it('should reject requests from disallowed origins', () => {
    req.headers.origin = 'http://evil.com';

    corsMiddleware(req, res, (err) => {
      expect(err).toBeDefined();
      expect(err.message).toBe('Not allowed by CORS');
    });
  });

  it('should set credentials header', () => {
    req.headers.origin = 'http://localhost:3000';

    corsMiddleware(req, res, next);

    expect(res.setHeader).toHaveBeenCalledWith('Access-Control-Allow-Credentials', 'true');
  });

  it('should handle OPTIONS preflight requests', () => {
    req.method = 'OPTIONS';
    req.headers.origin = 'http://localhost:3000';
    req.headers['access-control-request-method'] = 'POST';

    corsMiddleware(req, res, next);

    // CORS middleware should respond to OPTIONS
    expect(res.setHeader).toHaveBeenCalledWith('Access-Control-Allow-Origin', 'http://localhost:3000');
  });
});
