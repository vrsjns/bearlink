import { describe, it, expect, vi, beforeEach } from 'vitest';
import jwt from 'jsonwebtoken';

// Mock the logger before importing auth
vi.mock('shared/utils/logger', () => ({
  default: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
  },
}));

import { authenticateJWT, isAdmin, isSelfOrAdmin } from './auth';

describe('Auth Middleware', () => {
  const mockResponse = () => {
    const res = {};
    res.status = vi.fn().mockReturnValue(res);
    res.json = vi.fn().mockReturnValue(res);
    return res;
  };

  const mockNext = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.JWT_SECRET = 'test-secret';
  });

  describe('authenticateJWT', () => {
    it('should authenticate valid token and attach user to request', () => {
      const payload = { id: 1, email: 'test@example.com', role: 'USER' };
      const token = jwt.sign(payload, 'test-secret');
      const req = {
        headers: { authorization: `Bearer ${token}` },
      };
      const res = mockResponse();

      authenticateJWT(req, res, mockNext);

      // JWT verify is async, so we need to wait
      return new Promise((resolve) => {
        setTimeout(() => {
          expect(mockNext).toHaveBeenCalled();
          expect(req.user).toBeDefined();
          expect(req.user.id).toBe(1);
          expect(req.user.email).toBe('test@example.com');
          resolve();
        }, 10);
      });
    });

    it('should reject request without authorization header', () => {
      const req = { headers: {} };
      const res = mockResponse();

      authenticateJWT(req, res, mockNext);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: 'Missing authorization token' });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should reject invalid token', () => {
      const req = {
        headers: { authorization: 'Bearer invalid-token' },
      };
      const res = mockResponse();

      authenticateJWT(req, res, mockNext);

      return new Promise((resolve) => {
        setTimeout(() => {
          expect(res.status).toHaveBeenCalledWith(403);
          expect(mockNext).not.toHaveBeenCalled();
          resolve();
        }, 10);
      });
    });

    it('should reject expired token', () => {
      const payload = { id: 1, email: 'test@example.com', role: 'USER' };
      const token = jwt.sign(payload, 'test-secret', { expiresIn: '-1s' });
      const req = {
        headers: { authorization: `Bearer ${token}` },
      };
      const res = mockResponse();

      authenticateJWT(req, res, mockNext);

      return new Promise((resolve) => {
        setTimeout(() => {
          expect(res.status).toHaveBeenCalledWith(403);
          expect(mockNext).not.toHaveBeenCalled();
          resolve();
        }, 10);
      });
    });
  });

  describe('isAdmin', () => {
    it('should allow admin users to proceed', () => {
      const req = { user: { id: 1, role: 'ADMIN' } };
      const res = mockResponse();

      isAdmin(req, res, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    it('should reject non-admin users', () => {
      const req = { user: { id: 1, role: 'USER' } };
      const res = mockResponse();

      isAdmin(req, res, mockNext);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({ error: 'User does not have admin role' });
      expect(mockNext).not.toHaveBeenCalled();
    });
  });

  describe('isSelfOrAdmin', () => {
    it('should allow users to access their own resources', () => {
      const req = {
        user: { id: 1, role: 'USER' },
        params: { userId: '1' },
      };
      const res = mockResponse();

      isSelfOrAdmin(req, res, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    it('should allow admin users to access any resource', () => {
      const req = {
        user: { id: 1, role: 'ADMIN' },
        params: { userId: '999' },
      };
      const res = mockResponse();

      isSelfOrAdmin(req, res, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    it('should reject users accessing other users resources', () => {
      const req = {
        user: { id: 1, role: 'USER' },
        params: { userId: '2' },
      };
      const res = mockResponse();

      isSelfOrAdmin(req, res, mockNext);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        error: 'User does not have permission to access this resource',
      });
      expect(mockNext).not.toHaveBeenCalled();
    });
  });
});
