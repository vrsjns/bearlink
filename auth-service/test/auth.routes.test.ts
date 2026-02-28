import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

const getTokenFromCookie = (res: request.Response): string | undefined => {
  const cookie = res.headers['set-cookie']?.find((c: string) => c.startsWith('token='));
  return cookie?.split(';')[0].split('=')[1];
};

import { createMockPrismaClient, mockPrismaUser, resetPrismaMocks } from './mocks/prisma';
import { mockEventPublisher, resetRabbitMQMocks } from './mocks/rabbitmq';

// Import the REAL app factory - this tests the actual application
import { createApp } from '../app';
import { createLoginAttemptStore } from '../services/loginAttempts';
import { generateCsrfToken } from '../services/csrf.service';

describe('Auth Routes', () => {
  let app: express.Application;
  let mockPrisma: ReturnType<typeof createMockPrismaClient>;
  let loginAttemptStore: ReturnType<typeof createLoginAttemptStore>;

  const regularUser = { id: 1, email: 'user@example.com', name: 'Regular User', role: 'USER' };

  const generateTestToken = (user: { id: number; email: string; name: string; role: string }) =>
    jwt.sign(user, process.env.JWT_SECRET!, { expiresIn: '1h' });

  beforeEach(() => {
    // Reset all mocks before each test
    resetPrismaMocks();
    resetRabbitMQMocks();
    vi.clearAllMocks();

    // Create fresh mock prisma client and a fresh login attempt store per test
    mockPrisma = createMockPrismaClient();
    loginAttemptStore = createLoginAttemptStore();

    // Create the REAL app with mocked dependencies
    // This tests the actual application that will be deployed
    app = createApp({
      prisma: mockPrisma,
      eventPublisher: mockEventPublisher,
      loginAttemptStore,
    });
  });

  describe('POST /register', () => {
    const validRegistration = {
      email: 'test@example.com',
      password: 'Password123',
      name: 'Test User',
    };

    describe('successful registration', () => {
      it('should register a new user and set token cookie', async () => {
        const createdUser = {
          id: 1,
          email: validRegistration.email,
          name: validRegistration.name,
          password: 'hashedPassword',
          role: 'user',
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        mockPrismaUser.create.mockResolvedValue(createdUser);

        const response = await request(app)
          .post('/register')
          .send(validRegistration)
          .expect(200);

        expect(response.body).toHaveProperty('user');
        expect(response.body).not.toHaveProperty('token');

        const token = getTokenFromCookie(response);
        expect(token).toBeDefined();

        // Verify the token is valid
        const decoded = jwt.verify(token!, process.env.JWT_SECRET!) as any;
        expect(decoded.id).toBe(1);
        expect(decoded.email).toBe(validRegistration.email);
      });

      it('should hash the password before storing', async () => {
        const createdUser = {
          id: 1,
          email: validRegistration.email,
          name: validRegistration.name,
          password: 'hashedPassword',
          role: 'user',
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        mockPrismaUser.create.mockResolvedValue(createdUser);

        await request(app)
          .post('/register')
          .send(validRegistration)
          .expect(200);

        // Verify prisma.create was called with hashed password
        expect(mockPrismaUser.create).toHaveBeenCalledTimes(1);
        const createCall = mockPrismaUser.create.mock.calls[0][0];
        expect(createCall.data.email).toBe(validRegistration.email);
        expect(createCall.data.name).toBe(validRegistration.name);
        // Password should be hashed (not plain text)
        expect(createCall.data.password).not.toBe(validRegistration.password);
        // Verify it's a valid bcrypt hash
        const isValidHash = await bcrypt.compare(validRegistration.password, createCall.data.password);
        expect(isValidHash).toBe(true);
      });

      it('should publish user_registered event', async () => {
        const createdUser = {
          id: 1,
          email: validRegistration.email,
          name: validRegistration.name,
          password: 'hashedPassword',
          role: 'user',
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        mockPrismaUser.create.mockResolvedValue(createdUser);

        await request(app)
          .post('/register')
          .send(validRegistration)
          .expect(200);

        expect(mockEventPublisher.publishUserRegistered).toHaveBeenCalledTimes(1);
        const publishedUser = mockEventPublisher.publishUserRegistered.mock.calls[0][0];
        expect(publishedUser.id).toBe(1);
        expect(publishedUser.email).toBe(validRegistration.email);
        expect(publishedUser).not.toHaveProperty('password');
      });

      it('should publish welcome email notification', async () => {
        const createdUser = {
          id: 1,
          email: validRegistration.email,
          name: validRegistration.name,
          password: 'hashedPassword',
          role: 'user',
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        mockPrismaUser.create.mockResolvedValue(createdUser);

        await request(app)
          .post('/register')
          .send(validRegistration)
          .expect(200);

        expect(mockEventPublisher.publishEmailNotification).toHaveBeenCalledTimes(1);
        const emailPayload = mockEventPublisher.publishEmailNotification.mock.calls[0][0];
        expect(emailPayload.to).toBe(validRegistration.email);
        expect(emailPayload.subject).toBe('Welcome to BearLink!');
        expect(emailPayload.text).toContain(validRegistration.name);
      });
    });

    describe('validation errors', () => {
      it('should return 400 when email is missing', async () => {
        const response = await request(app)
          .post('/register')
          .send({ password: 'Password123', name: 'Test User' })
          .expect(400);

        expect(response.body).toHaveProperty('error');
        expect(response.body.error).toContain('Missing required fields');
        expect(response.body.details.missing).toContain('email');
      });

      it('should return 400 when password is missing', async () => {
        const response = await request(app)
          .post('/register')
          .send({ email: 'test@example.com', name: 'Test User' })
          .expect(400);

        expect(response.body).toHaveProperty('error');
        expect(response.body.error).toContain('Missing required fields');
        expect(response.body.details.missing).toContain('password');
      });

      it('should return 400 when name is missing', async () => {
        const response = await request(app)
          .post('/register')
          .send({ email: 'test@example.com', password: 'Password123' })
          .expect(400);

        expect(response.body).toHaveProperty('error');
        expect(response.body.error).toContain('Missing required fields');
        expect(response.body.details.missing).toContain('name');
      });

      it('should return 400 when multiple fields are missing', async () => {
        const response = await request(app)
          .post('/register')
          .send({})
          .expect(400);

        expect(response.body).toHaveProperty('error');
        expect(response.body.details.missing).toContain('email');
        expect(response.body.details.missing).toContain('password');
        expect(response.body.details.missing).toContain('name');
      });

      it('should return 400 for invalid email format', async () => {
        const response = await request(app)
          .post('/register')
          .send({ ...validRegistration, email: 'invalid-email' })
          .expect(400);

        expect(response.body).toHaveProperty('error');
        expect(response.body.error).toContain('Invalid email format');
      });

      it('should return 400 for email without domain', async () => {
        const response = await request(app)
          .post('/register')
          .send({ ...validRegistration, email: 'test@' })
          .expect(400);

        expect(response.body).toHaveProperty('error');
        expect(response.body.error).toContain('Invalid email format');
      });

      it('should return 400 for password shorter than 8 characters', async () => {
        const response = await request(app)
          .post('/register')
          .send({ ...validRegistration, password: 'Pass1' })
          .expect(400);

        expect(response.body).toHaveProperty('error');
        expect(response.body.error).toContain('Password must be at least 8 characters');
      });

      it('should return 400 for password without uppercase', async () => {
        const response = await request(app)
          .post('/register')
          .send({ ...validRegistration, password: 'password123' })
          .expect(400);

        expect(response.body).toHaveProperty('error');
        expect(response.body.error).toContain('Password must be at least 8 characters');
      });

      it('should return 400 for password without lowercase', async () => {
        const response = await request(app)
          .post('/register')
          .send({ ...validRegistration, password: 'PASSWORD123' })
          .expect(400);

        expect(response.body).toHaveProperty('error');
        expect(response.body.error).toContain('Password must be at least 8 characters');
      });

      it('should return 400 for password without number', async () => {
        const response = await request(app)
          .post('/register')
          .send({ ...validRegistration, password: 'PasswordOnly' })
          .expect(400);

        expect(response.body).toHaveProperty('error');
        expect(response.body.error).toContain('Password must be at least 8 characters');
      });

      it('should return 400 for empty string fields', async () => {
        const response = await request(app)
          .post('/register')
          .send({ email: '', password: '', name: '' })
          .expect(400);

        expect(response.body).toHaveProperty('error');
        expect(response.body.details.missing).toContain('email');
        expect(response.body.details.missing).toContain('password');
        expect(response.body.details.missing).toContain('name');
      });
    });

    describe('database errors', () => {
      it('should return 400 when user with email already exists', async () => {
        mockPrismaUser.create.mockRejectedValue(
          new Error('Unique constraint failed on the fields: (`email`)')
        );

        const response = await request(app)
          .post('/register')
          .send(validRegistration)
          .expect(400);

        expect(response.body).toHaveProperty('error');
        expect(response.body.error).toBe('User registration failed.');
      });

      it('should return 400 on database connection error', async () => {
        mockPrismaUser.create.mockRejectedValue(new Error('Database connection failed'));

        const response = await request(app)
          .post('/register')
          .send(validRegistration)
          .expect(400);

        expect(response.body).toHaveProperty('error');
        expect(response.body.error).toBe('User registration failed.');
      });

      it('should not publish events when registration fails', async () => {
        mockPrismaUser.create.mockRejectedValue(new Error('Database error'));

        await request(app)
          .post('/register')
          .send(validRegistration)
          .expect(400);

        expect(mockEventPublisher.publishUserRegistered).not.toHaveBeenCalled();
        expect(mockEventPublisher.publishEmailNotification).not.toHaveBeenCalled();
      });
    });
  });

  describe('POST /logout', () => {
    it('should clear the token cookie and return 204', async () => {
      const response = await request(app)
        .post('/logout')
        .expect(204);

      const cookie = response.headers['set-cookie']?.find((c: string) => c.startsWith('token='));
      expect(cookie).toMatch(/token=;/);
    });
  });

  describe('POST /login', () => {
    const validCredentials = {
      email: 'test@example.com',
      password: 'Password123',
    };

    describe('successful login', () => {
      it('should login with valid credentials and set token cookie', async () => {
        const hashedPassword = await bcrypt.hash(validCredentials.password, 10);
        const existingUser = {
          id: 1,
          email: validCredentials.email,
          password: hashedPassword,
          name: 'Test User',
          role: 'user',
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        mockPrismaUser.findUnique.mockResolvedValue(existingUser);

        const response = await request(app)
          .post('/login')
          .send(validCredentials)
          .expect(200);

        expect(response.body).toHaveProperty('user');
        expect(response.body).not.toHaveProperty('token');

        const token = getTokenFromCookie(response);
        expect(token).toBeDefined();

        // Verify the token contains correct user data
        const decoded = jwt.verify(token!, process.env.JWT_SECRET!) as any;
        expect(decoded.id).toBe(1);
        expect(decoded.email).toBe(validCredentials.email);
        expect(decoded.name).toBe('Test User');
        expect(decoded.role).toBe('user');
      });

      it('should query user by email', async () => {
        const hashedPassword = await bcrypt.hash(validCredentials.password, 10);
        mockPrismaUser.findUnique.mockResolvedValue({
          id: 1,
          email: validCredentials.email,
          password: hashedPassword,
          name: 'Test User',
          role: 'user',
        });

        await request(app)
          .post('/login')
          .send(validCredentials)
          .expect(200);

        expect(mockPrismaUser.findUnique).toHaveBeenCalledTimes(1);
        expect(mockPrismaUser.findUnique).toHaveBeenCalledWith({
          where: { email: validCredentials.email },
        });
      });

      it('should login admin user and include role in token', async () => {
        const hashedPassword = await bcrypt.hash(validCredentials.password, 10);
        const adminUser = {
          id: 1,
          email: validCredentials.email,
          password: hashedPassword,
          name: 'Admin User',
          role: 'admin',
        };

        mockPrismaUser.findUnique.mockResolvedValue(adminUser);

        const response = await request(app)
          .post('/login')
          .send(validCredentials)
          .expect(200);

        const token = getTokenFromCookie(response);
        const decoded = jwt.verify(token!, process.env.JWT_SECRET!) as any;
        expect(decoded.role).toBe('admin');
      });
    });

    describe('authentication failures', () => {
      it('should return 400 when user does not exist', async () => {
        mockPrismaUser.findUnique.mockResolvedValue(null);

        const response = await request(app)
          .post('/login')
          .send(validCredentials)
          .expect(400);

        expect(response.body).toHaveProperty('error');
        expect(response.body.error).toBe('Invalid email or password.');
      });

      it('should return 400 when password is incorrect', async () => {
        const hashedPassword = await bcrypt.hash('DifferentPassword1', 10);
        mockPrismaUser.findUnique.mockResolvedValue({
          id: 1,
          email: validCredentials.email,
          password: hashedPassword,
          name: 'Test User',
          role: 'user',
        });

        const response = await request(app)
          .post('/login')
          .send(validCredentials)
          .expect(400);

        expect(response.body).toHaveProperty('error');
        expect(response.body.error).toBe('Invalid email or password.');
      });

      it('should return same error for non-existent user and wrong password', async () => {
        // Test non-existent user
        mockPrismaUser.findUnique.mockResolvedValue(null);
        const response1 = await request(app)
          .post('/login')
          .send(validCredentials)
          .expect(400);

        // Test wrong password
        const hashedPassword = await bcrypt.hash('WrongPassword1', 10);
        mockPrismaUser.findUnique.mockResolvedValue({
          id: 1,
          email: validCredentials.email,
          password: hashedPassword,
          name: 'Test User',
          role: 'user',
        });
        const response2 = await request(app)
          .post('/login')
          .send(validCredentials)
          .expect(400);

        // Error messages should be identical (security best practice)
        expect(response1.body.error).toBe(response2.body.error);
      });
    });

    describe('missing credentials', () => {
      it('should return 400 when email is missing', async () => {
        const response = await request(app)
          .post('/login')
          .send({ password: 'Password123' })
          .expect(400);

        expect(response.body).toHaveProperty('error');
      });

      it('should return 400 when password is missing', async () => {
        const response = await request(app)
          .post('/login')
          .send({ email: 'test@example.com' })
          .expect(400);

        expect(response.body).toHaveProperty('error');
      });

      it('should return 400 when body is empty', async () => {
        const response = await request(app)
          .post('/login')
          .send({})
          .expect(400);

        expect(response.body).toHaveProperty('error');
      });
    });

    describe('database errors', () => {
      it('should return 400 on database error', async () => {
        mockPrismaUser.findUnique.mockRejectedValue(new Error('Database connection failed'));

        const response = await request(app)
          .post('/login')
          .send(validCredentials)
          .expect(400);

        expect(response.body).toHaveProperty('error');
        expect(response.body.error).toBe('User login failed.');
      });
    });

    describe('account lockout', () => {
      const lockedEmail = 'lockout@example.com';

      it('should return 429 after 5 failed login attempts', async () => {
        mockPrismaUser.findUnique.mockResolvedValue(null);

        for (let i = 0; i < 5; i++) {
          await request(app)
            .post('/login')
            .send({ email: lockedEmail, password: 'WrongPassword1' })
            .expect(400);
        }

        const response = await request(app)
          .post('/login')
          .send({ email: lockedEmail, password: 'WrongPassword1' })
          .expect(429);

        expect(response.body.error).toContain('Too many failed login attempts');
      });

      it('should return 429 even with correct credentials when account is locked', async () => {
        const hashedPassword = await bcrypt.hash('CorrectPassword1', 10);
        const existingUser = {
          id: 1,
          email: lockedEmail,
          password: hashedPassword,
          name: 'Test User',
          role: 'user',
        };

        mockPrismaUser.findUnique.mockResolvedValue(null);
        for (let i = 0; i < 5; i++) {
          await request(app)
            .post('/login')
            .send({ email: lockedEmail, password: 'WrongPassword1' })
            .expect(400);
        }

        mockPrismaUser.findUnique.mockResolvedValue(existingUser);
        const response = await request(app)
          .post('/login')
          .send({ email: lockedEmail, password: 'CorrectPassword1' })
          .expect(429);

        expect(response.body.error).toContain('Too many failed login attempts');
      });

      it('should reset counter on successful login', async () => {
        const hashedPassword = await bcrypt.hash('CorrectPassword1', 10);
        const existingUser = {
          id: 1,
          email: lockedEmail,
          password: hashedPassword,
          name: 'Test User',
          role: 'user',
        };

        // 4 failed attempts (one below threshold)
        mockPrismaUser.findUnique.mockResolvedValue(null);
        for (let i = 0; i < 4; i++) {
          await request(app)
            .post('/login')
            .send({ email: lockedEmail, password: 'WrongPassword1' })
            .expect(400);
        }

        // Successful login clears the counter
        mockPrismaUser.findUnique.mockResolvedValue(existingUser);
        await request(app)
          .post('/login')
          .send({ email: lockedEmail, password: 'CorrectPassword1' })
          .expect(200);

        // Subsequent failed attempt should not immediately lock (counter was reset)
        mockPrismaUser.findUnique.mockResolvedValue(null);
        const response = await request(app)
          .post('/login')
          .send({ email: lockedEmail, password: 'WrongPassword1' })
          .expect(400);

        expect(response.body.error).toBe('Invalid email or password.');
      });
    });
  });

  describe('edge cases', () => {
    it('should handle email with leading/trailing whitespace in login', async () => {
      const hashedPassword = await bcrypt.hash('Password123', 10);
      mockPrismaUser.findUnique.mockResolvedValue({
        id: 1,
        email: 'test@example.com',
        password: hashedPassword,
        name: 'Test User',
        role: 'user',
      });

      // Email with whitespace - should query with whitespace (as-is)
      await request(app)
        .post('/login')
        .send({ email: '  test@example.com  ', password: 'Password123' });

      // Verify the query used the email as provided
      expect(mockPrismaUser.findUnique).toHaveBeenCalledWith({
        where: { email: '  test@example.com  ' },
      });
    });

    it('should handle unicode characters in name', async () => {
      const unicodeName = 'Test User 日本語 émoji 🎉';
      const createdUser = {
        id: 1,
        email: 'test@example.com',
        name: unicodeName,
        password: 'hashedPassword',
        role: 'user',
      };

      mockPrismaUser.create.mockResolvedValue(createdUser);

      const response = await request(app)
        .post('/register')
        .send({
          email: 'test@example.com',
          password: 'Password123',
          name: unicodeName,
        })
        .expect(200);

      expect(response.body).toHaveProperty('user');
      expect(mockPrismaUser.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ name: unicodeName }),
        })
      );
    });

    it('should handle very long valid password', async () => {
      const longPassword = 'Password1' + 'a'.repeat(200);
      const createdUser = {
        id: 1,
        email: 'test@example.com',
        name: 'Test User',
        password: 'hashedPassword',
        role: 'user',
      };

      mockPrismaUser.create.mockResolvedValue(createdUser);

      const response = await request(app)
        .post('/register')
        .send({
          email: 'test@example.com',
          password: longPassword,
          name: 'Test User',
        })
        .expect(200);

      expect(response.body).toHaveProperty('user');
    });

    it('should handle special characters in password', async () => {
      const specialPassword = 'Password1!@#$%^&*()_+-=[]{}|;:,.<>?';
      const createdUser = {
        id: 1,
        email: 'test@example.com',
        name: 'Test User',
        password: 'hashedPassword',
        role: 'user',
      };

      mockPrismaUser.create.mockResolvedValue(createdUser);

      const response = await request(app)
        .post('/register')
        .send({
          email: 'test@example.com',
          password: specialPassword,
          name: 'Test User',
        })
        .expect(200);

      expect(response.body).toHaveProperty('user');
    });

    it('should accept valid email formats', async () => {
      const validEmails = [
        'simple@example.com',
        'very.common@example.com',
        'disposable.style.email.with+symbol@example.com',
        'user.name+tag+sorting@example.com',
        'x@example.com',
        'example-indeed@strange-example.com',
      ];

      for (const email of validEmails) {
        resetPrismaMocks();
        mockPrismaUser.create.mockResolvedValue({
          id: 1,
          email,
          name: 'Test User',
          password: 'hashedPassword',
          role: 'user',
        });

        const response = await request(app)
          .post('/register')
          .send({ email, password: 'Password123', name: 'Test User' });

        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty('user');
      }
    });

    it('should reject invalid email formats', async () => {
      const invalidEmails = [
        'plainaddress',
        '@no-local-part.com',
        'no-at-sign.com',
        'missing-at-sign.net',
        '.email@example.com',
        'email.@example.com',
        'email..email@example.com',
      ];

      for (const email of invalidEmails) {
        const response = await request(app)
          .post('/register')
          .send({ email, password: 'Password123', name: 'Test User' });

        expect(response.status).toBe(400);
        expect(response.body.error).toContain('Invalid email format');
      }
    });
  });

  describe('Content-Type handling', () => {
    it('should accept application/json content type', async () => {
      mockPrismaUser.create.mockResolvedValue({
        id: 1,
        email: 'test@example.com',
        name: 'Test User',
        password: 'hashedPassword',
        role: 'user',
      });

      const response = await request(app)
        .post('/register')
        .set('Content-Type', 'application/json')
        .send(JSON.stringify({
          email: 'test@example.com',
          password: 'Password123',
          name: 'Test User',
        }))
        .expect(200);

      expect(response.body).toHaveProperty('user');
    });
  });

  describe('GET /csrf-token', () => {
    it('should return a CSRF token when authenticated via cookie', async () => {
      const token = generateTestToken(regularUser);

      const response = await request(app)
        .get('/csrf-token')
        .set('Cookie', `token=${token}`)
        .expect(200);

      expect(response.body).toHaveProperty('csrfToken');
      expect(typeof response.body.csrfToken).toBe('string');
      expect(response.body.csrfToken).toBe(generateCsrfToken(token, process.env.JWT_SECRET!));
    });

    it('should return 401 when no token cookie is present', async () => {
      const response = await request(app)
        .get('/csrf-token')
        .expect(401);

      expect(response.body.error).toBe('Not authenticated.');
    });
  });

  describe('CSRF protection on mutating routes', () => {
    it('should return 403 on POST /logout with cookie auth but no CSRF token', async () => {
      const token = generateTestToken(regularUser);

      const response = await request(app)
        .post('/logout')
        .set('Cookie', `token=${token}`)
        .expect(403);

      expect(response.body.error).toBe('CSRF token missing.');
    });

    it('should return 403 on POST /logout with cookie auth and invalid CSRF token', async () => {
      const token = generateTestToken(regularUser);

      const response = await request(app)
        .post('/logout')
        .set('Cookie', `token=${token}`)
        .set('X-CSRF-Token', 'invalidtoken')
        .expect(403);

      expect(response.body.error).toBe('Invalid CSRF token.');
    });

    it('should succeed on POST /logout with cookie auth and valid CSRF token', async () => {
      const token = generateTestToken(regularUser);
      const csrfToken = generateCsrfToken(token, process.env.JWT_SECRET!);

      await request(app)
        .post('/logout')
        .set('Cookie', `token=${token}`)
        .set('X-CSRF-Token', csrfToken)
        .expect(204);
    });

    it('should skip CSRF check for requests using Bearer token (no cookie)', async () => {
      const token = generateTestToken(regularUser);

      // POST /logout with Bearer token — no cookie, CSRF middleware skips
      await request(app)
        .post('/logout')
        .set('Authorization', `Bearer ${token}`)
        .expect(204);
    });

    it('should skip CSRF check for GET requests even with cookie auth', async () => {
      const token = generateTestToken(regularUser);

      // GET /csrf-token itself — GET is not a mutating method
      await request(app)
        .get('/csrf-token')
        .set('Cookie', `token=${token}`)
        .expect(200);
    });
  });
});
