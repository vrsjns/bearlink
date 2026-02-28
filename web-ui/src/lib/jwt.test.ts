import { describe, it, expect, vi, beforeEach } from 'vitest';
import { parseJwt, getCurrentUser, JwtPayload } from './jwt';

describe('JWT Utils', () => {
  describe('parseJwt', () => {
    it('should parse valid JWT token', () => {
      const payload: JwtPayload = {
        id: 1,
        email: 'test@example.com',
        name: 'Test User',
        role: 'USER',
        iat: 1600000000,
        exp: 1900000000,
      };
      const encodedPayload = btoa(JSON.stringify(payload));
      const token = `header.${encodedPayload}.signature`;

      const result = parseJwt(token);

      expect(result).toEqual(payload);
    });

    it('should return null for invalid token structure', () => {
      expect(parseJwt('invalid')).toBeNull();
      expect(parseJwt('')).toBeNull();
      expect(parseJwt('no.dots')).toBeNull();
    });

    it('should return null for malformed base64', () => {
      const token = 'header.!!!invalid-base64!!!.signature';
      expect(parseJwt(token)).toBeNull();
    });

    it('should handle URL-safe base64 characters', () => {
      const payload: JwtPayload = {
        id: 1,
        email: 'test@example.com',
        name: 'Test User',
        role: 'USER',
        iat: 1600000000,
        exp: 1900000000,
      };
      const base64 = btoa(JSON.stringify(payload));
      const urlSafeBase64 = base64.replace(/\+/g, '-').replace(/\//g, '_');
      const token = `header.${urlSafeBase64}.signature`;

      const result = parseJwt(token);

      expect(result).toEqual(payload);
    });
  });

  describe('getCurrentUser', () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it('should return null when no user exists in localStorage', () => {
      (localStorage.getItem as ReturnType<typeof vi.fn>).mockReturnValue(null);

      const result = getCurrentUser();

      expect(result).toBeNull();
    });

    it('should return parsed user from localStorage', () => {
      const user: JwtPayload = {
        id: 1,
        email: 'test@example.com',
        name: 'Test User',
        role: 'USER',
        iat: 1600000000,
        exp: 1900000000,
      };

      (localStorage.getItem as ReturnType<typeof vi.fn>).mockReturnValue(JSON.stringify(user));

      const result = getCurrentUser();

      expect(result).toEqual(user);
    });

    it('should return null for invalid JSON in localStorage', () => {
      (localStorage.getItem as ReturnType<typeof vi.fn>).mockReturnValue('not-valid-json');

      const result = getCurrentUser();

      expect(result).toBeNull();
    });
  });
});
