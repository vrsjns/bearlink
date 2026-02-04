import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import jwt from 'jsonwebtoken';

import { createMockPrismaClient, mockPrismaURL, resetPrismaMocks } from './mocks/prisma';
import { mockEventPublisher, resetRabbitMQMocks } from './mocks/rabbitmq';

// Import the REAL app factory
import { createApp } from '../app';

describe('URLs Routes', () => {
  let app: express.Application;
  let mockPrisma: ReturnType<typeof createMockPrismaClient>;
  const baseUrl = 'http://localhost:5001';

  // Helper to generate valid JWT tokens for testing
  const generateTestToken = (user: { id: number; email: string; name: string; role: string }) => {
    return jwt.sign(user, process.env.JWT_SECRET!, { expiresIn: '1h' });
  };

  // Test users
  const regularUser = { id: 1, email: 'user@example.com', name: 'Regular User', role: 'USER' };
  const anotherUser = { id: 2, email: 'another@example.com', name: 'Another User', role: 'USER' };

  beforeEach(() => {
    resetPrismaMocks();
    resetRabbitMQMocks();
    vi.clearAllMocks();

    mockPrisma = createMockPrismaClient();

    app = createApp({
      prisma: mockPrisma,
      eventPublisher: mockEventPublisher,
      baseUrl,
    });
  });

  describe('GET /urls', () => {
    describe('successful requests', () => {
      it('should return list of URLs for authenticated user', async () => {
        const token = generateTestToken(regularUser);
        const urls = [
          { id: 1, shortId: 'abc1234567', originalUrl: 'https://example.com', userId: 1, clicks: 5 },
          { id: 2, shortId: 'xyz9876543', originalUrl: 'https://google.com', userId: 1, clicks: 10 },
        ];

        mockPrismaURL.findMany.mockResolvedValue(urls);

        const response = await request(app)
          .get('/urls')
          .set('Authorization', `Bearer ${token}`)
          .expect(200);

        expect(response.body).toHaveLength(2);
        expect(response.body[0].shortId).toBe('abc1234567');
        expect(response.body[1].shortId).toBe('xyz9876543');
      });

      it('should query URLs filtered by userId from token', async () => {
        const token = generateTestToken(regularUser);
        mockPrismaURL.findMany.mockResolvedValue([]);

        await request(app)
          .get('/urls')
          .set('Authorization', `Bearer ${token}`)
          .expect(200);

        expect(mockPrismaURL.findMany).toHaveBeenCalledWith({
          where: { userId: regularUser.id },
        });
      });

      it('should return empty array when user has no URLs', async () => {
        const token = generateTestToken(regularUser);
        mockPrismaURL.findMany.mockResolvedValue([]);

        const response = await request(app)
          .get('/urls')
          .set('Authorization', `Bearer ${token}`)
          .expect(200);

        expect(response.body).toEqual([]);
      });
    });

    describe('authentication errors', () => {
      it('should return 401 without authorization header', async () => {
        const response = await request(app)
          .get('/urls')
          .expect(401);

        expect(response.body.error).toContain('Missing authorization token');
      });

      it('should return 403 with invalid token', async () => {
        const response = await request(app)
          .get('/urls')
          .set('Authorization', 'Bearer invalid-token')
          .expect(403);

        expect(response.body).toHaveProperty('error');
      });
    });
  });

  describe('POST /urls', () => {
    describe('successful URL creation', () => {
      it('should create a shortened URL and return shortUrl', async () => {
        const token = generateTestToken(regularUser);

        mockPrismaURL.create.mockImplementation((args: any) => Promise.resolve({
          id: 1,
          shortId: args.data.shortId,
          originalUrl: args.data.originalUrl,
          userId: args.data.userId,
          clicks: 0,
        }));

        const response = await request(app)
          .post('/urls')
          .set('Authorization', `Bearer ${token}`)
          .send({ originalUrl: 'https://example.com' })
          .expect(200);

        expect(response.body).toHaveProperty('shortUrl');
        expect(response.body.shortUrl).toMatch(new RegExp(`^${baseUrl}/[A-Za-z0-9_-]{10}$`));
      });

      it('should store URL with userId from token', async () => {
        const token = generateTestToken(regularUser);

        mockPrismaURL.create.mockImplementation((args: any) => Promise.resolve({
          id: 1,
          shortId: args.data.shortId,
          originalUrl: args.data.originalUrl,
          userId: args.data.userId,
          clicks: 0,
        }));

        await request(app)
          .post('/urls')
          .set('Authorization', `Bearer ${token}`)
          .send({ originalUrl: 'https://example.com' })
          .expect(200);

        expect(mockPrismaURL.create).toHaveBeenCalledTimes(1);
        const createCall = mockPrismaURL.create.mock.calls[0][0];
        expect(createCall.data.originalUrl).toBe('https://example.com');
        expect(createCall.data.userId).toBe(regularUser.id);
        expect(createCall.data.shortId).toMatch(/^[A-Za-z0-9_-]{10}$/);
      });

      it('should publish url_created event', async () => {
        const token = generateTestToken(regularUser);

        mockPrismaURL.create.mockImplementation((args: any) => Promise.resolve({
          id: 1,
          shortId: args.data.shortId,
          originalUrl: args.data.originalUrl,
          userId: args.data.userId,
          clicks: 0,
        }));

        await request(app)
          .post('/urls')
          .set('Authorization', `Bearer ${token}`)
          .send({ originalUrl: 'https://example.com' })
          .expect(200);

        expect(mockEventPublisher.publishUrlCreated).toHaveBeenCalledTimes(1);
        const publishedUrl = mockEventPublisher.publishUrlCreated.mock.calls[0][0];
        expect(publishedUrl.originalUrl).toBe('https://example.com');
        expect(publishedUrl.userId).toBe(regularUser.id);
        expect(publishedUrl.shortId).toMatch(/^[A-Za-z0-9_-]{10}$/);
      });

      it('should accept URLs with query parameters', async () => {
        const token = generateTestToken(regularUser);
        const urlWithParams = 'https://example.com/path?query=value&foo=bar';

        mockPrismaURL.create.mockImplementation((args: any) => Promise.resolve({
          id: 1,
          shortId: args.data.shortId,
          originalUrl: args.data.originalUrl,
          userId: args.data.userId,
          clicks: 0,
        }));

        const response = await request(app)
          .post('/urls')
          .set('Authorization', `Bearer ${token}`)
          .send({ originalUrl: urlWithParams })
          .expect(200);

        expect(response.body.shortUrl).toBeDefined();
      });

      it('should accept HTTP URLs', async () => {
        const token = generateTestToken(regularUser);

        mockPrismaURL.create.mockImplementation((args: any) => Promise.resolve({
          id: 1,
          shortId: args.data.shortId,
          originalUrl: args.data.originalUrl,
          userId: args.data.userId,
          clicks: 0,
        }));

        const response = await request(app)
          .post('/urls')
          .set('Authorization', `Bearer ${token}`)
          .send({ originalUrl: 'http://example.com' })
          .expect(200);

        expect(response.body.shortUrl).toBeDefined();
      });
    });

    describe('validation errors', () => {
      it('should return 400 when originalUrl is missing', async () => {
        const token = generateTestToken(regularUser);

        const response = await request(app)
          .post('/urls')
          .set('Authorization', `Bearer ${token}`)
          .send({})
          .expect(400);

        expect(response.body).toHaveProperty('error');
        expect(response.body.error).toContain('Missing required fields');
      });

      it('should return 400 for invalid URL format', async () => {
        const token = generateTestToken(regularUser);

        const response = await request(app)
          .post('/urls')
          .set('Authorization', `Bearer ${token}`)
          .send({ originalUrl: 'not-a-valid-url' })
          .expect(400);

        expect(response.body).toHaveProperty('error');
        expect(response.body.error).toContain('Invalid URL');
      });

      it('should return 400 for FTP URLs', async () => {
        const token = generateTestToken(regularUser);

        const response = await request(app)
          .post('/urls')
          .set('Authorization', `Bearer ${token}`)
          .send({ originalUrl: 'ftp://files.example.com/file.txt' })
          .expect(400);

        expect(response.body.error).toContain('Invalid URL');
      });

      it('should return 400 for javascript: URLs', async () => {
        const token = generateTestToken(regularUser);

        const response = await request(app)
          .post('/urls')
          .set('Authorization', `Bearer ${token}`)
          .send({ originalUrl: 'javascript:alert(1)' })
          .expect(400);

        expect(response.body.error).toContain('Invalid URL');
      });

      it('should return 400 for empty originalUrl', async () => {
        const token = generateTestToken(regularUser);

        const response = await request(app)
          .post('/urls')
          .set('Authorization', `Bearer ${token}`)
          .send({ originalUrl: '' })
          .expect(400);

        expect(response.body).toHaveProperty('error');
      });
    });

    describe('database errors', () => {
      it('should return 500 on database error', async () => {
        const token = generateTestToken(regularUser);
        mockPrismaURL.create.mockRejectedValue(new Error('Database connection failed'));

        const response = await request(app)
          .post('/urls')
          .set('Authorization', `Bearer ${token}`)
          .send({ originalUrl: 'https://example.com' })
          .expect(500);

        expect(response.body.error).toBe('Failed to shorten URL');
      });

      it('should not publish event when creation fails', async () => {
        const token = generateTestToken(regularUser);
        mockPrismaURL.create.mockRejectedValue(new Error('Database error'));

        await request(app)
          .post('/urls')
          .set('Authorization', `Bearer ${token}`)
          .send({ originalUrl: 'https://example.com' })
          .expect(500);

        expect(mockEventPublisher.publishUrlCreated).not.toHaveBeenCalled();
      });
    });
  });

  describe('PUT /urls/:id', () => {
    describe('successful updates', () => {
      it('should update URL originalUrl', async () => {
        const token = generateTestToken(regularUser);
        const updatedUrl = {
          id: 1,
          shortId: 'abc1234567',
          originalUrl: 'https://newsite.com',
          userId: regularUser.id,
          clicks: 5,
        };

        mockPrismaURL.update.mockResolvedValue(updatedUrl);

        const response = await request(app)
          .put('/urls/1')
          .set('Authorization', `Bearer ${token}`)
          .send({ originalURL: 'https://newsite.com' })
          .expect(200);

        expect(response.body.originalUrl).toBe('https://newsite.com');
      });

      it('should update URL scoped to userId', async () => {
        const token = generateTestToken(regularUser);
        mockPrismaURL.update.mockResolvedValue({
          id: 1,
          shortId: 'abc1234567',
          originalUrl: 'https://newsite.com',
          userId: regularUser.id,
          clicks: 0,
        });

        await request(app)
          .put('/urls/1')
          .set('Authorization', `Bearer ${token}`)
          .send({ originalURL: 'https://newsite.com' })
          .expect(200);

        expect(mockPrismaURL.update).toHaveBeenCalledWith({
          where: { userId: regularUser.id, id: 1 },
          data: { originalUrl: 'https://newsite.com' },
        });
      });
    });

    describe('validation errors', () => {
      it('should return 400 for invalid URL ID', async () => {
        const token = generateTestToken(regularUser);

        const response = await request(app)
          .put('/urls/invalid')
          .set('Authorization', `Bearer ${token}`)
          .send({ originalURL: 'https://newsite.com' })
          .expect(400);

        expect(response.body.error).toBe('Invalid URL ID.');
      });

      it('should return 400 when originalURL is missing', async () => {
        const token = generateTestToken(regularUser);

        const response = await request(app)
          .put('/urls/1')
          .set('Authorization', `Bearer ${token}`)
          .send({})
          .expect(400);

        expect(response.body.error).toBe('Missing original URL.');
      });

      it('should return 400 for invalid URL format', async () => {
        const token = generateTestToken(regularUser);

        const response = await request(app)
          .put('/urls/1')
          .set('Authorization', `Bearer ${token}`)
          .send({ originalURL: 'not-a-url' })
          .expect(400);

        expect(response.body.error).toContain('Invalid URL');
      });
    });
  });

  describe('DELETE /urls/:id', () => {
    describe('successful deletion', () => {
      it('should delete URL and return 204', async () => {
        const token = generateTestToken(regularUser);
        mockPrismaURL.delete.mockResolvedValue({});

        await request(app)
          .delete('/urls/1')
          .set('Authorization', `Bearer ${token}`)
          .expect(204);

        expect(mockPrismaURL.delete).toHaveBeenCalledWith({
          where: { id: 1, userId: regularUser.id },
        });
      });
    });

    describe('validation errors', () => {
      it('should return 400 for invalid URL ID', async () => {
        const token = generateTestToken(regularUser);

        const response = await request(app)
          .delete('/urls/invalid')
          .set('Authorization', `Bearer ${token}`)
          .expect(400);

        expect(response.body.error).toBe('Invalid URL ID.');
      });
    });

    describe('error handling', () => {
      it('should return 500 on database error', async () => {
        const token = generateTestToken(regularUser);
        mockPrismaURL.delete.mockRejectedValue(new Error('Database error'));

        const response = await request(app)
          .delete('/urls/1')
          .set('Authorization', `Bearer ${token}`)
          .expect(500);

        expect(response.body.error).toBe('Failed to delete URL');
      });
    });
  });

  describe('Security', () => {
    it('should require authentication for all endpoints', async () => {
      await request(app).get('/urls').expect(401);
      await request(app).post('/urls').send({ originalUrl: 'https://example.com' }).expect(401);
      await request(app).put('/urls/1').send({ originalURL: 'https://example.com' }).expect(401);
      await request(app).delete('/urls/1').expect(401);
    });

    it('should reject expired tokens', async () => {
      const expiredToken = jwt.sign(regularUser, process.env.JWT_SECRET!, { expiresIn: '-1h' });

      await request(app)
        .get('/urls')
        .set('Authorization', `Bearer ${expiredToken}`)
        .expect(403);
    });

    it('should reject tokens signed with wrong secret', async () => {
      const fakeToken = jwt.sign(regularUser, 'wrong-secret', { expiresIn: '1h' });

      await request(app)
        .get('/urls')
        .set('Authorization', `Bearer ${fakeToken}`)
        .expect(403);
    });
  });
});
