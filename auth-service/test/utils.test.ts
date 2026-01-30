import { describe, it, expect } from 'vitest';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';

// Test the utility functions that would be exported from the service
describe('Auth Service Utilities', () => {
  describe('generateToken', () => {
    const generateToken = (user: { id: number; email: string; name: string; role: string }) =>
      jwt.sign(
        { id: user.id, email: user.email, name: user.name, role: user.role },
        process.env.JWT_SECRET!,
        { expiresIn: '1h' }
      );

    it('should generate a valid JWT token', () => {
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
      expect(decoded.iat).toBeDefined();
    });
  });

  describe('sanitizeUser', () => {
    const sanitizeUser = (user: { password: string; [key: string]: any }) => {
      const { password, ...sanitized } = user;
      return sanitized;
    };

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
    });
  });

  describe('password hashing', () => {
    it('should hash password correctly', async () => {
      const password = 'Password123';
      const hashed = await bcrypt.hash(password, 10);

      expect(hashed).not.toBe(password);
      expect(hashed.length).toBeGreaterThan(0);
    });

    it('should verify correct password', async () => {
      const password = 'Password123';
      const hashed = await bcrypt.hash(password, 10);

      const isValid = await bcrypt.compare(password, hashed);
      expect(isValid).toBe(true);
    });

    it('should reject incorrect password', async () => {
      const password = 'Password123';
      const hashed = await bcrypt.hash(password, 10);

      const isValid = await bcrypt.compare('WrongPassword', hashed);
      expect(isValid).toBe(false);
    });
  });
});
