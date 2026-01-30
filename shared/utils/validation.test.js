import { describe, it, expect, vi } from 'vitest';
import {
  isValidEmail,
  isValidPassword,
  isValidUrl,
  isSafeRedirectUrl,
  isValidName,
  validateRequiredFields,
  validationError,
} from './validation';

describe('Validation Utils', () => {
  describe('isValidEmail', () => {
    it('should accept valid emails', () => {
      expect(isValidEmail('test@example.com')).toBe(true);
      expect(isValidEmail('user.name@domain.co.uk')).toBe(true);
      expect(isValidEmail('user+tag@example.org')).toBe(true);
    });

    it('should reject invalid emails', () => {
      expect(isValidEmail('invalid')).toBe(false);
      expect(isValidEmail('missing@')).toBe(false);
      expect(isValidEmail('@domain.com')).toBe(false);
      expect(isValidEmail('')).toBe(false);
    });

    it('should handle non-string inputs', () => {
      expect(isValidEmail(null)).toBe(false);
      expect(isValidEmail(undefined)).toBe(false);
      expect(isValidEmail(123)).toBe(false);
      expect(isValidEmail({})).toBe(false);
    });
  });

  describe('isValidPassword', () => {
    it('should accept strong passwords', () => {
      expect(isValidPassword('Password123')).toBe(true);
      expect(isValidPassword('Str0ngP@ss')).toBe(true);
      expect(isValidPassword('MyP4ssword!')).toBe(true);
    });

    it('should reject passwords shorter than 8 characters', () => {
      expect(isValidPassword('Pass1')).toBe(false);
      expect(isValidPassword('Ab1')).toBe(false);
    });

    it('should reject passwords without uppercase', () => {
      expect(isValidPassword('password123')).toBe(false);
    });

    it('should reject passwords without lowercase', () => {
      expect(isValidPassword('PASSWORD123')).toBe(false);
    });

    it('should reject passwords without numbers', () => {
      expect(isValidPassword('PasswordOnly')).toBe(false);
    });

    it('should handle non-string inputs', () => {
      expect(isValidPassword(null)).toBe(false);
      expect(isValidPassword(undefined)).toBe(false);
      expect(isValidPassword(12345678)).toBe(false);
    });
  });

  describe('isValidUrl', () => {
    it('should accept valid HTTP/HTTPS URLs', () => {
      expect(isValidUrl('https://example.com')).toBe(true);
      expect(isValidUrl('http://example.com')).toBe(true);
      expect(isValidUrl('https://example.com/path?query=1')).toBe(true);
      expect(isValidUrl('http://localhost:3000')).toBe(true);
    });

    it('should reject non-HTTP protocols', () => {
      expect(isValidUrl('ftp://example.com')).toBe(false);
      expect(isValidUrl('javascript:alert(1)')).toBe(false);
      expect(isValidUrl('data:text/html,<h1>Hi</h1>')).toBe(false);
      expect(isValidUrl('file:///etc/passwd')).toBe(false);
    });

    it('should reject invalid URLs', () => {
      expect(isValidUrl('not-a-url')).toBe(false);
      expect(isValidUrl('')).toBe(false);
      expect(isValidUrl('example.com')).toBe(false);
    });

    it('should handle non-string inputs', () => {
      expect(isValidUrl(null)).toBe(false);
      expect(isValidUrl(undefined)).toBe(false);
      expect(isValidUrl({})).toBe(false);
    });
  });

  describe('isSafeRedirectUrl', () => {
    it('should accept safe redirect URLs', () => {
      expect(isSafeRedirectUrl('https://example.com')).toBe(true);
      expect(isSafeRedirectUrl('http://example.com/path')).toBe(true);
    });

    it('should reject unsafe redirect URLs', () => {
      expect(isSafeRedirectUrl('javascript:alert(1)')).toBe(false);
      expect(isSafeRedirectUrl('data:text/html,test')).toBe(false);
    });
  });

  describe('isValidName', () => {
    it('should accept valid names', () => {
      expect(isValidName('John')).toBe(true);
      expect(isValidName('John Doe')).toBe(true);
      expect(isValidName('A')).toBe(true);
      expect(isValidName('A'.repeat(100))).toBe(true);
    });

    it('should reject empty or whitespace-only names', () => {
      expect(isValidName('')).toBe(false);
      expect(isValidName('   ')).toBe(false);
    });

    it('should reject names exceeding 100 characters', () => {
      expect(isValidName('A'.repeat(101))).toBe(false);
    });

    it('should handle non-string inputs', () => {
      expect(isValidName(null)).toBe(false);
      expect(isValidName(undefined)).toBe(false);
      expect(isValidName(123)).toBe(false);
    });

    it('should trim whitespace before validating', () => {
      expect(isValidName('  John  ')).toBe(true);
    });
  });

  describe('validateRequiredFields', () => {
    it('should pass when all required fields are present', () => {
      const obj = { name: 'John', email: 'john@example.com', age: 30 };
      const result = validateRequiredFields(obj, ['name', 'email']);
      expect(result.isValid).toBe(true);
      expect(result.missing).toEqual([]);
    });

    it('should fail when required fields are missing', () => {
      const obj = { name: 'John' };
      const result = validateRequiredFields(obj, ['name', 'email']);
      expect(result.isValid).toBe(false);
      expect(result.missing).toEqual(['email']);
    });

    it('should treat null, undefined, and empty string as missing', () => {
      const obj = { a: null, b: undefined, c: '' };
      const result = validateRequiredFields(obj, ['a', 'b', 'c']);
      expect(result.isValid).toBe(false);
      expect(result.missing).toEqual(['a', 'b', 'c']);
    });

    it('should accept zero and false as valid values', () => {
      const obj = { count: 0, active: false };
      const result = validateRequiredFields(obj, ['count', 'active']);
      expect(result.isValid).toBe(true);
      expect(result.missing).toEqual([]);
    });
  });

  describe('validationError', () => {
    it('should send 400 response with error message', () => {
      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn().mockReturnThis(),
      };

      validationError(res, 'Invalid input');

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Invalid input' });
    });

    it('should include details when provided', () => {
      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn().mockReturnThis(),
      };

      validationError(res, 'Validation failed', { field: 'email', reason: 'invalid format' });

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Validation failed',
        details: { field: 'email', reason: 'invalid format' },
      });
    });
  });
});
