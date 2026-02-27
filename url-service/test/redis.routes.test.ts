/**
 * Tests for Redis-backed behaviors:
 *  - URL lookup caching (cache hit / cache miss)
 *  - Cache invalidation on update and delete
 *  - Click deduplication
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import jwt from 'jsonwebtoken';

import { createMockPrismaClient, mockPrismaURL, resetPrismaMocks } from './mocks/prisma';
import { mockEventPublisher, resetRabbitMQMocks } from './mocks/rabbitmq';
import { mockRedis, resetRedisMocks } from './mocks/redis';
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
  utmParams: null,
  clicks: 5,
  previewTitle: null,
  previewDescription: null,
  previewImageUrl: null,
  previewFetchedAt: null,
  createdAt: new Date('2026-01-01'),
  ...overrides,
});

describe('Redis Integration', () => {
  let app: express.Application;
  let mockPrisma: ReturnType<typeof createMockPrismaClient>;
  const baseUrl = 'http://localhost:5001';
  const regularUser = { id: 1, email: 'user@example.com', name: 'Regular User', role: 'USER' };
  const generateToken = (user = regularUser) =>
    jwt.sign(user, process.env.JWT_SECRET!, { expiresIn: '1h' });

  beforeEach(() => {
    resetPrismaMocks();
    resetRabbitMQMocks();
    resetRedisMocks();
    vi.clearAllMocks();
    mockPrisma = createMockPrismaClient();
    // Pass mockRedis as the redis dep — every test in this file uses Redis
    app = createApp({ prisma: mockPrisma, eventPublisher: mockEventPublisher, baseUrl, redis: mockRedis as any });
  });

  // ─── Redirect caching ─────────────────────────────────────────────────────

  describe('GET /:shortId — URL caching', () => {
    it('should serve from cache on a cache hit and skip DB lookup', async () => {
      const url = makeUrl();
      mockRedis.get.mockResolvedValue(JSON.stringify(url));

      const response = await request(app)
        .get('/abc1234567')
        .set('User-Agent', 'Mozilla/5.0')
        .expect(302);

      expect(response.headers.location).toBe('https://example.com');
      expect(mockPrismaURL.findFirst).not.toHaveBeenCalled();
    });

    it('should query DB on a cache miss and then write to cache', async () => {
      const url = makeUrl();
      mockRedis.get.mockResolvedValue(null);           // cache miss
      mockPrismaURL.findFirst.mockResolvedValue(url);
      mockPrismaURL.update.mockResolvedValue({ ...url, clicks: 6 });
      mockRedis.setex.mockResolvedValue('OK');

      await request(app)
        .get('/abc1234567')
        .set('User-Agent', 'Mozilla/5.0')
        .expect(302);

      expect(mockPrismaURL.findFirst).toHaveBeenCalledTimes(1);
      expect(mockRedis.setex).toHaveBeenCalledWith(
        'url:abc1234567',
        60,
        expect.any(String)
      );
    });

    it('should rehydrate Date fields from cached JSON', async () => {
      const url = makeUrl({ expiresAt: new Date(Date.now() + 60_000) });
      mockRedis.get.mockResolvedValue(JSON.stringify(url));
      mockPrismaURL.update.mockResolvedValue({ ...url, clicks: 6 });

      // Should NOT 410 because expiresAt is in the future
      await request(app)
        .get('/abc1234567')
        .set('User-Agent', 'Mozilla/5.0')
        .expect(302);
    });

    it('should return 410 for expired link served from cache', async () => {
      const url = makeUrl({ expiresAt: new Date('2020-01-01') });
      mockRedis.get.mockResolvedValue(JSON.stringify(url));

      const response = await request(app).get('/abc1234567').expect(410);
      expect(response.body.error).toBe('This link has expired.');
      expect(mockPrismaURL.findFirst).not.toHaveBeenCalled();
    });

    it('should fall back to DB if Redis.get throws', async () => {
      const url = makeUrl();
      mockRedis.get.mockRejectedValue(new Error('Redis down'));
      mockPrismaURL.findFirst.mockResolvedValue(url);
      mockPrismaURL.update.mockResolvedValue({ ...url, clicks: 6 });

      await request(app)
        .get('/abc1234567')
        .set('User-Agent', 'Mozilla/5.0')
        .expect(302);

      expect(mockPrismaURL.findFirst).toHaveBeenCalledTimes(1);
    });
  });

  // ─── Cache invalidation ───────────────────────────────────────────────────

  describe('Cache invalidation', () => {
    it('should invalidate cache by shortId on PUT /urls/:id', async () => {
      const token = generateToken();
      const updated = makeUrl({ originalUrl: 'https://newsite.com' });
      mockPrismaURL.update.mockResolvedValue(updated);
      mockRedis.del.mockResolvedValue(1);

      await request(app)
        .put('/urls/1')
        .set('Authorization', `Bearer ${token}`)
        .send({ originalUrl: 'https://newsite.com' })
        .expect(200);

      expect(mockRedis.del).toHaveBeenCalledWith('url:abc1234567');
    });

    it('should also invalidate customAlias cache key on PUT when alias is set', async () => {
      const token = generateToken();
      const updated = makeUrl({ originalUrl: 'https://newsite.com', customAlias: 'my-brand' });
      mockPrismaURL.update.mockResolvedValue(updated);
      mockRedis.del.mockResolvedValue(2);

      await request(app)
        .put('/urls/1')
        .set('Authorization', `Bearer ${token}`)
        .send({ originalUrl: 'https://newsite.com' })
        .expect(200);

      expect(mockRedis.del).toHaveBeenCalledWith('url:abc1234567', 'url:my-brand');
    });

    it('should invalidate cache by shortId on DELETE /urls/:id', async () => {
      const token = generateToken();
      mockPrismaURL.delete.mockResolvedValue(makeUrl());
      mockRedis.del.mockResolvedValue(1);

      await request(app)
        .delete('/urls/1')
        .set('Authorization', `Bearer ${token}`)
        .expect(204);

      expect(mockRedis.del).toHaveBeenCalledWith('url:abc1234567');
    });

    it('should not crash if Redis.del throws during invalidation', async () => {
      const token = generateToken();
      const updated = makeUrl({ originalUrl: 'https://newsite.com' });
      mockPrismaURL.update.mockResolvedValue(updated);
      mockRedis.del.mockRejectedValue(new Error('Redis down'));

      // Should still return 200 — cache invalidation errors are non-fatal
      await request(app)
        .put('/urls/1')
        .set('Authorization', `Bearer ${token}`)
        .send({ originalUrl: 'https://newsite.com' })
        .expect(200);
    });
  });

  // ─── Click deduplication ──────────────────────────────────────────────────

  describe('GET /:shortId — click deduplication', () => {
    it('should count a click when Redis SET NX returns OK (unique)', async () => {
      const url = makeUrl();
      mockRedis.get.mockResolvedValue(JSON.stringify(url));
      mockRedis.set.mockResolvedValue('OK');   // first click from this IP
      mockPrismaURL.update.mockResolvedValue({ ...url, clicks: 6 });

      await request(app)
        .get('/abc1234567')
        .set('User-Agent', 'Mozilla/5.0')
        .expect(302);

      expect(mockPrismaURL.update).toHaveBeenCalledTimes(1);
      expect(mockEventPublisher.publishUrlClicked).toHaveBeenCalledTimes(1);
    });

    it('should not count a click when Redis SET NX returns null (duplicate)', async () => {
      const url = makeUrl();
      mockRedis.get.mockResolvedValue(JSON.stringify(url));
      mockRedis.set.mockResolvedValue(null);   // already counted this IP/hour

      await request(app)
        .get('/abc1234567')
        .set('User-Agent', 'Mozilla/5.0')
        .expect(302);

      expect(mockPrismaURL.update).not.toHaveBeenCalled();
      expect(mockEventPublisher.publishUrlClicked).not.toHaveBeenCalled();
    });

    it('should use key format dedup:shortId:ip:hour', async () => {
      const url = makeUrl();
      mockRedis.get.mockResolvedValue(JSON.stringify(url));
      mockRedis.set.mockResolvedValue('OK');
      mockPrismaURL.update.mockResolvedValue({ ...url, clicks: 6 });

      await request(app)
        .get('/abc1234567')
        .set('User-Agent', 'Mozilla/5.0')
        .expect(302);

      const setCall = mockRedis.set.mock.calls[0];
      expect(setCall[0]).toMatch(/^dedup:abc1234567:/);
      expect(setCall[1]).toBe('1');
      expect(setCall[2]).toBe('EX');
      expect(setCall[3]).toBe(3600);
      expect(setCall[4]).toBe('NX');
    });

    it('should count click if Redis.set throws (fail-open)', async () => {
      const url = makeUrl();
      mockRedis.get.mockResolvedValue(JSON.stringify(url));
      mockRedis.set.mockRejectedValue(new Error('Redis down'));
      mockPrismaURL.update.mockResolvedValue({ ...url, clicks: 6 });

      await request(app)
        .get('/abc1234567')
        .set('User-Agent', 'Mozilla/5.0')
        .expect(302);

      // Should still count — fail-open behavior
      expect(mockPrismaURL.update).toHaveBeenCalledTimes(1);
    });

    it('should not attempt dedup for bot requests', async () => {
      const url = makeUrl();
      mockRedis.get.mockResolvedValue(JSON.stringify(url));

      await request(app)
        .get('/abc1234567')
        .set('User-Agent', 'Googlebot/2.1')
        .expect(302);

      expect(mockRedis.set).not.toHaveBeenCalled();
      expect(mockPrismaURL.update).not.toHaveBeenCalled();
    });
  });
});
