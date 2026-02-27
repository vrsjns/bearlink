import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import jwt from 'jsonwebtoken';

import { createMockPrismaClient, mockPrismaURL, resetPrismaMocks } from './mocks/prisma';
import { mockEventPublisher, resetRabbitMQMocks } from './mocks/rabbitmq';

// Import the REAL app factory
import { createApp } from '../app';

const makeUrl = (overrides = {}) => ({
  id: 1,
  shortId: 'abc1234567',
  customAlias: null,
  originalUrl: 'https://example.com',
  userId: 1,
  redirectType: 302,
  expiresAt: null,
  passwordHash: null,
  tags: [],
  clicks: 0,
  ...overrides,
});

describe('URLs Routes', () => {
  let app: express.Application;
  let mockPrisma: ReturnType<typeof createMockPrismaClient>;
  const baseUrl = 'http://localhost:5001';

  const generateTestToken = (user: { id: number; email: string; name: string; role: string }) =>
    jwt.sign(user, process.env.JWT_SECRET!, { expiresIn: '1h' });

  const regularUser = { id: 1, email: 'user@example.com', name: 'Regular User', role: 'USER' };

  beforeEach(() => {
    resetPrismaMocks();
    resetRabbitMQMocks();
    vi.clearAllMocks();
    mockPrisma = createMockPrismaClient();
    app = createApp({ prisma: mockPrisma, eventPublisher: mockEventPublisher, baseUrl });
  });

  // ─── GET /urls ────────────────────────────────────────────────────────────

  describe('GET /urls', () => {
    beforeEach(() => {
      mockPrismaURL.count.mockResolvedValue(0);
    });

    describe('paginated response shape', () => {
      it('should return data array and pagination object', async () => {
        const token = generateTestToken(regularUser);
        const urls = [makeUrl({ id: 1 }), makeUrl({ id: 2, shortId: 'xyz9876543' })];
        mockPrismaURL.findMany.mockResolvedValue(urls);
        mockPrismaURL.count.mockResolvedValue(2);

        const response = await request(app)
          .get('/urls')
          .set('Authorization', `Bearer ${token}`)
          .expect(200);

        expect(response.body.data).toHaveLength(2);
        expect(response.body.pagination).toMatchObject({ page: 1, limit: 20, total: 2, pages: 1 });
      });

      it('should default to page 1, limit 20', async () => {
        const token = generateTestToken(regularUser);
        mockPrismaURL.findMany.mockResolvedValue([]);

        await request(app).get('/urls').set('Authorization', `Bearer ${token}`).expect(200);

        expect(mockPrismaURL.findMany).toHaveBeenCalledWith(
          expect.objectContaining({ skip: 0, take: 20, orderBy: { createdAt: 'desc' } })
        );
      });

      it('should apply page and limit from query params', async () => {
        const token = generateTestToken(regularUser);
        mockPrismaURL.findMany.mockResolvedValue([]);
        mockPrismaURL.count.mockResolvedValue(50);

        const response = await request(app)
          .get('/urls?page=3&limit=10')
          .set('Authorization', `Bearer ${token}`)
          .expect(200);

        expect(response.body.pagination).toMatchObject({ page: 3, limit: 10, total: 50, pages: 5 });
        expect(mockPrismaURL.findMany).toHaveBeenCalledWith(
          expect.objectContaining({ skip: 20, take: 10 })
        );
      });

      it('should cap limit at 100', async () => {
        const token = generateTestToken(regularUser);
        mockPrismaURL.findMany.mockResolvedValue([]);

        await request(app)
          .get('/urls?limit=999')
          .set('Authorization', `Bearer ${token}`)
          .expect(200);

        expect(mockPrismaURL.findMany).toHaveBeenCalledWith(
          expect.objectContaining({ take: 100 })
        );
      });
    });

    describe('filtering', () => {
      it('should filter by tag', async () => {
        const token = generateTestToken(regularUser);
        mockPrismaURL.findMany.mockResolvedValue([]);

        await request(app)
          .get('/urls?tag=promo')
          .set('Authorization', `Bearer ${token}`)
          .expect(200);

        const whereArg = mockPrismaURL.findMany.mock.calls[0][0].where;
        expect(whereArg.AND).toContainEqual({ tags: { has: 'promo' } });
      });

      it('should filter by search term (originalUrl + customAlias)', async () => {
        const token = generateTestToken(regularUser);
        mockPrismaURL.findMany.mockResolvedValue([]);

        await request(app)
          .get('/urls?search=example')
          .set('Authorization', `Bearer ${token}`)
          .expect(200);

        const whereArg = mockPrismaURL.findMany.mock.calls[0][0].where;
        expect(whereArg.AND).toContainEqual({
          OR: [
            { originalUrl: { contains: 'example', mode: 'insensitive' } },
            { customAlias: { contains: 'example', mode: 'insensitive' } },
          ],
        });
      });

      it('should filter expired=true to only expired links', async () => {
        const token = generateTestToken(regularUser);
        mockPrismaURL.findMany.mockResolvedValue([]);

        await request(app)
          .get('/urls?expired=true')
          .set('Authorization', `Bearer ${token}`)
          .expect(200);

        const whereArg = mockPrismaURL.findMany.mock.calls[0][0].where;
        expect(whereArg.AND[0].expiresAt).toHaveProperty('lt');
      });

      it('should filter expired=false to only active/non-expiring links', async () => {
        const token = generateTestToken(regularUser);
        mockPrismaURL.findMany.mockResolvedValue([]);

        await request(app)
          .get('/urls?expired=false')
          .set('Authorization', `Bearer ${token}`)
          .expect(200);

        const whereArg = mockPrismaURL.findMany.mock.calls[0][0].where;
        expect(whereArg.AND[0].OR).toContainEqual({ expiresAt: null });
      });

      it('should combine multiple filters with AND', async () => {
        const token = generateTestToken(regularUser);
        mockPrismaURL.findMany.mockResolvedValue([]);

        await request(app)
          .get('/urls?tag=promo&search=shop&expired=false')
          .set('Authorization', `Bearer ${token}`)
          .expect(200);

        const whereArg = mockPrismaURL.findMany.mock.calls[0][0].where;
        expect(whereArg.AND).toHaveLength(3);
      });
    });

    describe('auth', () => {
      it('should return 401 without authorization header', async () => {
        const response = await request(app).get('/urls').expect(401);
        expect(response.body.error).toContain('Missing authorization token');
      });

      it('should return 403 with invalid token', async () => {
        await request(app).get('/urls').set('Authorization', 'Bearer invalid-token').expect(403);
      });
    });
  });

  // ─── POST /urls ───────────────────────────────────────────────────────────

  describe('POST /urls', () => {
    describe('basic creation', () => {
      it('should create a shortened URL and return shortUrl', async () => {
        const token = generateTestToken(regularUser);
        mockPrismaURL.create.mockImplementation((args: any) =>
          Promise.resolve(makeUrl({ shortId: args.data.shortId }))
        );

        const response = await request(app)
          .post('/urls')
          .set('Authorization', `Bearer ${token}`)
          .send({ originalUrl: 'https://example.com' })
          .expect(200);

        expect(response.body).toHaveProperty('shortUrl');
        expect(response.body.shortUrl).toMatch(new RegExp(`^${baseUrl}/`));
      });

      it('should use nanoid shortId when no customAlias provided', async () => {
        const token = generateTestToken(regularUser);
        mockPrismaURL.create.mockImplementation((args: any) =>
          Promise.resolve(makeUrl({ shortId: args.data.shortId }))
        );

        await request(app)
          .post('/urls')
          .set('Authorization', `Bearer ${token}`)
          .send({ originalUrl: 'https://example.com' })
          .expect(200);

        const createCall = mockPrismaURL.create.mock.calls[0][0];
        expect(createCall.data.shortId).toMatch(/^[A-Za-z0-9_-]{10}$/);
        expect(createCall.data.customAlias).toBeUndefined();
      });

      it('should store URL with userId from token', async () => {
        const token = generateTestToken(regularUser);
        mockPrismaURL.create.mockImplementation((args: any) =>
          Promise.resolve(makeUrl({ shortId: args.data.shortId, userId: args.data.userId }))
        );

        await request(app)
          .post('/urls')
          .set('Authorization', `Bearer ${token}`)
          .send({ originalUrl: 'https://example.com' })
          .expect(200);

        expect(mockPrismaURL.create.mock.calls[0][0].data.userId).toBe(regularUser.id);
      });

      it('should default redirectType to 302', async () => {
        const token = generateTestToken(regularUser);
        mockPrismaURL.create.mockImplementation((args: any) =>
          Promise.resolve(makeUrl({ shortId: args.data.shortId, redirectType: args.data.redirectType }))
        );

        await request(app)
          .post('/urls')
          .set('Authorization', `Bearer ${token}`)
          .send({ originalUrl: 'https://example.com' })
          .expect(200);

        expect(mockPrismaURL.create.mock.calls[0][0].data.redirectType).toBe(302);
      });

      it('should accept redirectType 301', async () => {
        const token = generateTestToken(regularUser);
        mockPrismaURL.create.mockImplementation((args: any) =>
          Promise.resolve(makeUrl({ shortId: args.data.shortId, redirectType: args.data.redirectType }))
        );

        await request(app)
          .post('/urls')
          .set('Authorization', `Bearer ${token}`)
          .send({ originalUrl: 'https://example.com', redirectType: 301 })
          .expect(200);

        expect(mockPrismaURL.create.mock.calls[0][0].data.redirectType).toBe(301);
      });

      it('should publish url_created event (without passwordHash)', async () => {
        const token = generateTestToken(regularUser);
        const created = makeUrl({ shortId: 'abc1234567', passwordHash: 'hash' });
        mockPrismaURL.create.mockResolvedValue(created);

        await request(app)
          .post('/urls')
          .set('Authorization', `Bearer ${token}`)
          .send({ originalUrl: 'https://example.com' })
          .expect(200);

        expect(mockEventPublisher.publishUrlCreated).toHaveBeenCalledTimes(1);
        const published = mockEventPublisher.publishUrlCreated.mock.calls[0][0];
        expect(published.passwordHash).toBeUndefined();
        expect(published.originalUrl).toBe('https://example.com');
      });
    });

    describe('custom alias', () => {
      it('should use customAlias in the returned shortUrl', async () => {
        const token = generateTestToken(regularUser);
        mockPrismaURL.create.mockResolvedValue(makeUrl({ customAlias: 'my-brand' }));

        const response = await request(app)
          .post('/urls')
          .set('Authorization', `Bearer ${token}`)
          .send({ originalUrl: 'https://example.com', customAlias: 'my-brand' })
          .expect(200);

        expect(response.body.shortUrl).toBe(`${baseUrl}/my-brand`);
      });

      it('should store customAlias in the database', async () => {
        const token = generateTestToken(regularUser);
        mockPrismaURL.create.mockResolvedValue(makeUrl({ customAlias: 'my-brand' }));

        await request(app)
          .post('/urls')
          .set('Authorization', `Bearer ${token}`)
          .send({ originalUrl: 'https://example.com', customAlias: 'my-brand' })
          .expect(200);

        expect(mockPrismaURL.create.mock.calls[0][0].data.customAlias).toBe('my-brand');
      });

      it('should return 409 when customAlias is already taken', async () => {
        const token = generateTestToken(regularUser);
        mockPrismaURL.create.mockRejectedValue(Object.assign(new Error('Unique'), { code: 'P2002' }));

        const response = await request(app)
          .post('/urls')
          .set('Authorization', `Bearer ${token}`)
          .send({ originalUrl: 'https://example.com', customAlias: 'taken' })
          .expect(409);

        expect(response.body.error).toBe('Custom alias is already taken.');
      });

      it('should return 400 for alias shorter than 3 chars', async () => {
        const token = generateTestToken(regularUser);

        const response = await request(app)
          .post('/urls')
          .set('Authorization', `Bearer ${token}`)
          .send({ originalUrl: 'https://example.com', customAlias: 'ab' })
          .expect(400);

        expect(response.body.error).toContain('Custom alias must be');
      });

      it('should return 400 for alias with invalid characters', async () => {
        const token = generateTestToken(regularUser);

        const response = await request(app)
          .post('/urls')
          .set('Authorization', `Bearer ${token}`)
          .send({ originalUrl: 'https://example.com', customAlias: 'bad alias!' })
          .expect(400);

        expect(response.body.error).toContain('Custom alias must be');
      });

      it('should return 400 for reserved alias', async () => {
        const token = generateTestToken(regularUser);

        const response = await request(app)
          .post('/urls')
          .set('Authorization', `Bearer ${token}`)
          .send({ originalUrl: 'https://example.com', customAlias: 'urls' })
          .expect(400);

        expect(response.body.error).toContain('reserved');
      });
    });

    describe('expiration', () => {
      it('should store expiresAt when provided', async () => {
        const token = generateTestToken(regularUser);
        const future = new Date(Date.now() + 86_400_000).toISOString();
        mockPrismaURL.create.mockImplementation((args: any) =>
          Promise.resolve(makeUrl({ expiresAt: args.data.expiresAt }))
        );

        await request(app)
          .post('/urls')
          .set('Authorization', `Bearer ${token}`)
          .send({ originalUrl: 'https://example.com', expiresAt: future })
          .expect(200);

        const expiresAtPassed = mockPrismaURL.create.mock.calls[0][0].data.expiresAt;
        expect(expiresAtPassed).toBeInstanceOf(Date);
      });

      it('should return 400 for invalid expiresAt format', async () => {
        const token = generateTestToken(regularUser);

        const response = await request(app)
          .post('/urls')
          .set('Authorization', `Bearer ${token}`)
          .send({ originalUrl: 'https://example.com', expiresAt: 'not-a-date' })
          .expect(400);

        expect(response.body.error).toContain('expiresAt');
      });

      it('should return 400 for expiresAt in the past', async () => {
        const token = generateTestToken(regularUser);

        const response = await request(app)
          .post('/urls')
          .set('Authorization', `Bearer ${token}`)
          .send({ originalUrl: 'https://example.com', expiresAt: '2020-01-01T00:00:00Z' })
          .expect(400);

        expect(response.body.error).toContain('future');
      });
    });

    describe('password protection', () => {
      it('should hash password and store passwordHash', async () => {
        const token = generateTestToken(regularUser);
        mockPrismaURL.create.mockImplementation((args: any) =>
          Promise.resolve(makeUrl({ passwordHash: args.data.passwordHash }))
        );

        await request(app)
          .post('/urls')
          .set('Authorization', `Bearer ${token}`)
          .send({ originalUrl: 'https://example.com', password: 'secret' })
          .expect(200);

        const stored = mockPrismaURL.create.mock.calls[0][0].data.passwordHash;
        expect(stored).toBeDefined();
        expect(stored).not.toBe('secret');
      });
    });

    describe('tags', () => {
      it('should store tags when provided', async () => {
        const token = generateTestToken(regularUser);
        mockPrismaURL.create.mockImplementation((args: any) =>
          Promise.resolve(makeUrl({ tags: args.data.tags }))
        );

        await request(app)
          .post('/urls')
          .set('Authorization', `Bearer ${token}`)
          .send({ originalUrl: 'https://example.com', tags: ['campaign', 'twitter'] })
          .expect(200);

        expect(mockPrismaURL.create.mock.calls[0][0].data.tags).toEqual(['campaign', 'twitter']);
      });

      it('should default tags to empty array', async () => {
        const token = generateTestToken(regularUser);
        mockPrismaURL.create.mockImplementation((args: any) =>
          Promise.resolve(makeUrl({ tags: args.data.tags }))
        );

        await request(app)
          .post('/urls')
          .set('Authorization', `Bearer ${token}`)
          .send({ originalUrl: 'https://example.com' })
          .expect(200);

        expect(mockPrismaURL.create.mock.calls[0][0].data.tags).toEqual([]);
      });

      it('should return 400 for non-array tags', async () => {
        const token = generateTestToken(regularUser);

        const response = await request(app)
          .post('/urls')
          .set('Authorization', `Bearer ${token}`)
          .send({ originalUrl: 'https://example.com', tags: 'not-an-array' })
          .expect(400);

        expect(response.body.error).toContain('tags');
      });
    });

    describe('shortId collision retry', () => {
      it('should retry on shortId collision and succeed on second attempt', async () => {
        const token = generateTestToken(regularUser);
        const collisionError = Object.assign(new Error('Unique'), { code: 'P2002' });

        mockPrismaURL.create
          .mockRejectedValueOnce(collisionError)
          .mockImplementation((args: any) => Promise.resolve(makeUrl({ shortId: args.data.shortId })));

        const response = await request(app)
          .post('/urls')
          .set('Authorization', `Bearer ${token}`)
          .send({ originalUrl: 'https://example.com' })
          .expect(200);

        expect(mockPrismaURL.create).toHaveBeenCalledTimes(2);
        expect(response.body).toHaveProperty('shortUrl');
      });

      it('should return 500 after exhausting all retries', async () => {
        const token = generateTestToken(regularUser);
        const collisionError = Object.assign(new Error('Unique'), { code: 'P2002' });

        mockPrismaURL.create.mockRejectedValue(collisionError);

        await request(app)
          .post('/urls')
          .set('Authorization', `Bearer ${token}`)
          .send({ originalUrl: 'https://example.com' })
          .expect(500);

        expect(mockPrismaURL.create).toHaveBeenCalledTimes(3);
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
        expect(response.body.error).toContain('Missing required fields');
      });

      it('should return 400 for invalid URL format', async () => {
        const token = generateTestToken(regularUser);
        const response = await request(app)
          .post('/urls')
          .set('Authorization', `Bearer ${token}`)
          .send({ originalUrl: 'not-a-valid-url' })
          .expect(400);
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

      it('should return 400 for invalid redirectType', async () => {
        const token = generateTestToken(regularUser);
        const response = await request(app)
          .post('/urls')
          .set('Authorization', `Bearer ${token}`)
          .send({ originalUrl: 'https://example.com', redirectType: 303 })
          .expect(400);
        expect(response.body.error).toContain('redirectType must be 301 or 302');
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

  // ─── PUT /urls/:id ────────────────────────────────────────────────────────

  describe('PUT /urls/:id', () => {
    describe('successful updates', () => {
      it('should update URL originalUrl', async () => {
        const token = generateTestToken(regularUser);
        const updated = makeUrl({ originalUrl: 'https://newsite.com' });
        mockPrismaURL.update.mockResolvedValue(updated);

        const response = await request(app)
          .put('/urls/1')
          .set('Authorization', `Bearer ${token}`)
          .send({ originalUrl: 'https://newsite.com' })
          .expect(200);

        expect(response.body.originalUrl).toBe('https://newsite.com');
      });

      it('should update URL scoped to userId', async () => {
        const token = generateTestToken(regularUser);
        mockPrismaURL.update.mockResolvedValue(makeUrl({ originalUrl: 'https://newsite.com' }));

        await request(app)
          .put('/urls/1')
          .set('Authorization', `Bearer ${token}`)
          .send({ originalUrl: 'https://newsite.com' })
          .expect(200);

        expect(mockPrismaURL.update).toHaveBeenCalledWith({
          where: { userId: regularUser.id, id: 1 },
          data: { originalUrl: 'https://newsite.com' },
        });
      });

      it('should update redirectType when provided', async () => {
        const token = generateTestToken(regularUser);
        mockPrismaURL.update.mockResolvedValue(makeUrl({ redirectType: 301 }));

        await request(app)
          .put('/urls/1')
          .set('Authorization', `Bearer ${token}`)
          .send({ originalUrl: 'https://newsite.com', redirectType: 301 })
          .expect(200);

        expect(mockPrismaURL.update.mock.calls[0][0].data.redirectType).toBe(301);
      });

      it('should update customAlias when provided', async () => {
        const token = generateTestToken(regularUser);
        mockPrismaURL.update.mockResolvedValue(makeUrl({ customAlias: 'new-alias' }));

        await request(app)
          .put('/urls/1')
          .set('Authorization', `Bearer ${token}`)
          .send({ originalUrl: 'https://newsite.com', customAlias: 'new-alias' })
          .expect(200);

        expect(mockPrismaURL.update.mock.calls[0][0].data.customAlias).toBe('new-alias');
      });

      it('should remove customAlias when set to null', async () => {
        const token = generateTestToken(regularUser);
        mockPrismaURL.update.mockResolvedValue(makeUrl({ customAlias: null }));

        await request(app)
          .put('/urls/1')
          .set('Authorization', `Bearer ${token}`)
          .send({ originalUrl: 'https://newsite.com', customAlias: null })
          .expect(200);

        expect(mockPrismaURL.update.mock.calls[0][0].data.customAlias).toBeNull();
      });

      it('should update tags when provided', async () => {
        const token = generateTestToken(regularUser);
        mockPrismaURL.update.mockResolvedValue(makeUrl({ tags: ['promo'] }));

        await request(app)
          .put('/urls/1')
          .set('Authorization', `Bearer ${token}`)
          .send({ originalUrl: 'https://newsite.com', tags: ['promo'] })
          .expect(200);

        expect(mockPrismaURL.update.mock.calls[0][0].data.tags).toEqual(['promo']);
      });

      it('should remove password when set to null', async () => {
        const token = generateTestToken(regularUser);
        mockPrismaURL.update.mockResolvedValue(makeUrl({ passwordHash: null }));

        await request(app)
          .put('/urls/1')
          .set('Authorization', `Bearer ${token}`)
          .send({ originalUrl: 'https://newsite.com', password: null })
          .expect(200);

        expect(mockPrismaURL.update.mock.calls[0][0].data.passwordHash).toBeNull();
      });

      it('should publish url_updated event (without passwordHash)', async () => {
        const token = generateTestToken(regularUser);
        const updated = makeUrl({ passwordHash: 'hash', originalUrl: 'https://newsite.com' });
        mockPrismaURL.update.mockResolvedValue(updated);

        await request(app)
          .put('/urls/1')
          .set('Authorization', `Bearer ${token}`)
          .send({ originalUrl: 'https://newsite.com' })
          .expect(200);

        expect(mockEventPublisher.publishUrlUpdated).toHaveBeenCalledTimes(1);
        const published = mockEventPublisher.publishUrlUpdated.mock.calls[0][0];
        expect(published.passwordHash).toBeUndefined();
      });

      it('should return 404 when URL not found', async () => {
        const token = generateTestToken(regularUser);
        mockPrismaURL.update.mockRejectedValue(Object.assign(new Error('Not found'), { code: 'P2025' }));

        const response = await request(app)
          .put('/urls/999')
          .set('Authorization', `Bearer ${token}`)
          .send({ originalUrl: 'https://newsite.com' })
          .expect(404);

        expect(response.body.error).toBe('URL not found.');
      });

      it('should return 409 when customAlias is already taken', async () => {
        const token = generateTestToken(regularUser);
        mockPrismaURL.update.mockRejectedValue(Object.assign(new Error('Unique'), { code: 'P2002' }));

        const response = await request(app)
          .put('/urls/1')
          .set('Authorization', `Bearer ${token}`)
          .send({ originalUrl: 'https://newsite.com', customAlias: 'taken' })
          .expect(409);

        expect(response.body.error).toBe('Custom alias is already taken.');
      });
    });

    describe('validation errors', () => {
      it('should return 400 for invalid URL ID', async () => {
        const token = generateTestToken(regularUser);
        const response = await request(app)
          .put('/urls/invalid')
          .set('Authorization', `Bearer ${token}`)
          .send({ originalUrl: 'https://newsite.com' })
          .expect(400);
        expect(response.body.error).toBe('Invalid URL ID.');
      });

      it('should return 400 when originalUrl is missing', async () => {
        const token = generateTestToken(regularUser);
        const response = await request(app)
          .put('/urls/1')
          .set('Authorization', `Bearer ${token}`)
          .send({})
          .expect(400);
        expect(response.body.error).toBe('Missing original URL.');
      });

      it('should return 400 for invalid redirectType', async () => {
        const token = generateTestToken(regularUser);
        const response = await request(app)
          .put('/urls/1')
          .set('Authorization', `Bearer ${token}`)
          .send({ originalUrl: 'https://newsite.com', redirectType: 200 })
          .expect(400);
        expect(response.body.error).toContain('redirectType must be 301 or 302');
      });

      it('should return 400 for invalid customAlias', async () => {
        const token = generateTestToken(regularUser);
        const response = await request(app)
          .put('/urls/1')
          .set('Authorization', `Bearer ${token}`)
          .send({ originalUrl: 'https://newsite.com', customAlias: 'a' })
          .expect(400);
        expect(response.body.error).toContain('Custom alias must be');
      });
    });
  });

  // ─── DELETE /urls/:id ─────────────────────────────────────────────────────

  describe('DELETE /urls/:id', () => {
    it('should delete URL and return 204', async () => {
      const token = generateTestToken(regularUser);
      mockPrismaURL.delete.mockResolvedValue(makeUrl());

      await request(app)
        .delete('/urls/1')
        .set('Authorization', `Bearer ${token}`)
        .expect(204);

      expect(mockPrismaURL.delete).toHaveBeenCalledWith({ where: { id: 1, userId: regularUser.id } });
    });

    it('should publish url_deleted event (without passwordHash)', async () => {
      const token = generateTestToken(regularUser);
      mockPrismaURL.delete.mockResolvedValue(makeUrl({ passwordHash: 'hash' }));

      await request(app)
        .delete('/urls/1')
        .set('Authorization', `Bearer ${token}`)
        .expect(204);

      expect(mockEventPublisher.publishUrlDeleted).toHaveBeenCalledTimes(1);
      const published = mockEventPublisher.publishUrlDeleted.mock.calls[0][0];
      expect(published.passwordHash).toBeUndefined();
    });

    it('should return 404 when URL not found', async () => {
      const token = generateTestToken(regularUser);
      mockPrismaURL.delete.mockRejectedValue(Object.assign(new Error('Not found'), { code: 'P2025' }));

      const response = await request(app)
        .delete('/urls/999')
        .set('Authorization', `Bearer ${token}`)
        .expect(404);

      expect(response.body.error).toBe('URL not found.');
    });

    it('should return 400 for invalid URL ID', async () => {
      const token = generateTestToken(regularUser);
      const response = await request(app)
        .delete('/urls/invalid')
        .set('Authorization', `Bearer ${token}`)
        .expect(400);
      expect(response.body.error).toBe('Invalid URL ID.');
    });

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

  // ─── Security ─────────────────────────────────────────────────────────────

  describe('Security', () => {
    it('should require authentication for all endpoints', async () => {
      await request(app).get('/urls').expect(401);
      await request(app).post('/urls').send({ originalUrl: 'https://example.com' }).expect(401);
      await request(app).put('/urls/1').send({ originalUrl: 'https://example.com' }).expect(401);
      await request(app).delete('/urls/1').expect(401);
    });

    it('should reject expired tokens', async () => {
      const expiredToken = jwt.sign(regularUser, process.env.JWT_SECRET!, { expiresIn: '-1h' });
      await request(app).get('/urls').set('Authorization', `Bearer ${expiredToken}`).expect(403);
    });

    it('should reject tokens signed with wrong secret', async () => {
      const fakeToken = jwt.sign(regularUser, 'wrong-secret', { expiresIn: '1h' });
      await request(app).get('/urls').set('Authorization', `Bearer ${fakeToken}`).expect(403);
    });
  });
});
