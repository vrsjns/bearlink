import { describe, it, expect } from 'vitest';
import jwt from 'jsonwebtoken';

// Import actual functions from the service
const { generateToken, sanitizeUser } = require('../services/token.service');

describe('Token Service', () => {
  describe('generateToken', () => {
    it('should generate a valid JWT token with user claims', () => {
      const user = { id: 1, email: 'test@example.com', name: 'Test User', role: 'USER' };
      const token = generateToken(user);

      expect(token).toBeDefined();
      expect(typeof token).toBe('string');

      const decoded = jwt.verify(token, process.env.JWT_SECRET!) as any;
      expect(decoded.id).toBe(1);
      expect(decoded.email).toBe('test@example.com');
      expect(decoded.name).toBe('Test User');
      expect(decoded.role).toBe('USER');
    });

    it('should include expiration in token', () => {
      const user = { id: 1, email: 'test@example.com', name: 'Test User', role: 'USER' };
      const token = generateToken(user);

      const decoded = jwt.verify(token, process.env.JWT_SECRET!) as any;
      expect(decoded.exp).toBeDefined();
    });

    it('should only include id, email, name, and role in token payload', () => {
      const user = {
        id: 1,
        email: 'test@example.com',
        name: 'Test User',
        role: 'USER',
        password: 'secret',
        createdAt: new Date(),
      };
      const token = generateToken(user);

      const decoded = jwt.verify(token, process.env.JWT_SECRET!) as any;
      expect(decoded).not.toHaveProperty('password');
      expect(decoded).not.toHaveProperty('createdAt');
    });
  });

  describe('sanitizeUser', () => {
    it('should remove password from user object', () => {
      const user = {
        id: 1,
        email: 'test@example.com',
        password: 'hashedpassword',
        name: 'Test User',
        role: 'USER',
      };

      const sanitized = sanitizeUser(user);

      expect(sanitized).not.toHaveProperty('password');
      expect(sanitized.id).toBe(1);
      expect(sanitized.email).toBe('test@example.com');
      expect(sanitized.name).toBe('Test User');
      expect(sanitized.role).toBe('USER');
    });

    it('should preserve all other user properties', () => {
      const user = {
        id: 1,
        email: 'test@example.com',
        password: 'hashedpassword',
        name: 'Test User',
        role: 'ADMIN',
        createdAt: new Date('2024-01-01'),
        updatedAt: new Date('2024-01-02'),
      };

      const sanitized = sanitizeUser(user);

      expect(sanitized.createdAt).toEqual(new Date('2024-01-01'));
      expect(sanitized.updatedAt).toEqual(new Date('2024-01-02'));
      expect(sanitized.role).toBe('ADMIN');
    });
  });
});
