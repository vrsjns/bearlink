import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import bcrypt from 'bcryptjs';

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
  clicks: 5,
  ...overrides,
});

describe('Redirect Routes', () => {
  let app: express.Application;
  let mockPrisma: ReturnType<typeof createMockPrismaClient>;
  const baseUrl = 'http://localhost:5001';

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

  describe('GET /:shortId', () => {
    describe('successful redirects', () => {
      it('should redirect to original URL with 302 by default', async () => {
        const url = makeUrl();
        mockPrismaURL.findFirst.mockResolvedValue(url);
        mockPrismaURL.update.mockResolvedValue({ ...url, clicks: 6 });

        const response = await request(app).get('/abc1234567').expect(302);
        expect(response.headers.location).toBe('https://example.com');
      });

      it('should redirect with 301 when redirectType is 301', async () => {
        const url = makeUrl({ redirectType: 301 });
        mockPrismaURL.findFirst.mockResolvedValue(url);
        mockPrismaURL.update.mockResolvedValue({ ...url, clicks: 6 });

        const response = await request(app).get('/abc1234567').expect(301);
        expect(response.headers.location).toBe('https://example.com');
      });

      it('should resolve by custom alias', async () => {
        const url = makeUrl({ customAlias: 'my-brand' });
        mockPrismaURL.findFirst.mockResolvedValue(url);
        mockPrismaURL.update.mockResolvedValue({ ...url, clicks: 6 });

        const response = await request(app).get('/my-brand').expect(302);
        expect(response.headers.location).toBe('https://example.com');
      });

      it('should increment click counter', async () => {
        const url = makeUrl();
        mockPrismaURL.findFirst.mockResolvedValue(url);
        mockPrismaURL.update.mockResolvedValue({ ...url, clicks: 6 });

        await request(app).get('/abc1234567').expect(302);

        expect(mockPrismaURL.update).toHaveBeenCalledWith({
          where: { shortId: 'abc1234567' },
          data: { clicks: { increment: 1 } },
        });
      });

      it('should publish url_clicked event', async () => {
        const url = makeUrl();
        mockPrismaURL.findFirst.mockResolvedValue(url);
        mockPrismaURL.update.mockResolvedValue({ ...url, clicks: 6 });

        await request(app).get('/abc1234567').expect(302);

        expect(mockEventPublisher.publishUrlClicked).toHaveBeenCalledWith({
          shortId: 'abc1234567',
          originalUrl: 'https://example.com',
        });
      });

      it('should redirect to URLs with query parameters', async () => {
        const url = makeUrl({ originalUrl: 'https://example.com/path?query=value&foo=bar' });
        mockPrismaURL.findFirst.mockResolvedValue(url);
        mockPrismaURL.update.mockResolvedValue({ ...url, clicks: 1 });

        const response = await request(app).get('/abc1234567').expect(302);
        expect(response.headers.location).toBe('https://example.com/path?query=value&foo=bar');
      });

      it('should redirect to HTTP URLs', async () => {
        const url = makeUrl({ originalUrl: 'http://example.com' });
        mockPrismaURL.findFirst.mockResolvedValue(url);
        mockPrismaURL.update.mockResolvedValue({ ...url, clicks: 1 });

        const response = await request(app).get('/abc1234567').expect(302);
        expect(response.headers.location).toBe('http://example.com');
      });
    });

    describe('expiration', () => {
      it('should return 410 for an expired link', async () => {
        const url = makeUrl({ expiresAt: new Date('2020-01-01') });
        mockPrismaURL.findFirst.mockResolvedValue(url);

        const response = await request(app).get('/abc1234567').expect(410);
        expect(response.body.error).toBe('This link has expired.');
      });

      it('should redirect a link that has not yet expired', async () => {
        const future = new Date(Date.now() + 60_000);
        const url = makeUrl({ expiresAt: future });
        mockPrismaURL.findFirst.mockResolvedValue(url);
        mockPrismaURL.update.mockResolvedValue({ ...url, clicks: 6 });

        await request(app).get('/abc1234567').expect(302);
      });

      it('should not increment clicks for expired links', async () => {
        const url = makeUrl({ expiresAt: new Date('2020-01-01') });
        mockPrismaURL.findFirst.mockResolvedValue(url);

        await request(app).get('/abc1234567').expect(410);
        expect(mockPrismaURL.update).not.toHaveBeenCalled();
      });
    });

    describe('password protection', () => {
      it('should return 401 with requiresPassword flag for protected links', async () => {
        const url = makeUrl({ passwordHash: '$2b$10$hashedpassword' });
        mockPrismaURL.findFirst.mockResolvedValue(url);

        const response = await request(app).get('/abc1234567').expect(401);
        expect(response.body.requiresPassword).toBe(true);
        expect(response.body.error).toBe('Password required.');
      });

      it('should not increment clicks for password-protected links on GET', async () => {
        const url = makeUrl({ passwordHash: '$2b$10$hashedpassword' });
        mockPrismaURL.findFirst.mockResolvedValue(url);

        await request(app).get('/abc1234567').expect(401);
        expect(mockPrismaURL.update).not.toHaveBeenCalled();
      });
    });

    describe('not found', () => {
      it('should return 404 for non-existent shortId', async () => {
        mockPrismaURL.findFirst.mockResolvedValue(null);

        const response = await request(app).get('/nonexistent').expect(404);
        expect(response.body.error).toBe('URL not found');
      });

      it('should not increment clicks for non-existent URL', async () => {
        mockPrismaURL.findFirst.mockResolvedValue(null);

        await request(app).get('/nonexistent').expect(404);
        expect(mockPrismaURL.update).not.toHaveBeenCalled();
      });
    });

    describe('security', () => {
      it('should block javascript: URLs', async () => {
        const url = makeUrl({ shortId: 'malicious1', originalUrl: 'javascript:alert(1)' });
        mockPrismaURL.findFirst.mockResolvedValue(url);

        const response = await request(app).get('/malicious1').expect(400);
        expect(response.body.error).toBe('URL is not safe for redirect');
      });

      it('should block data: URLs', async () => {
        const url = makeUrl({ shortId: 'malicious2', originalUrl: 'data:text/html,<script>alert(1)</script>' });
        mockPrismaURL.findFirst.mockResolvedValue(url);

        const response = await request(app).get('/malicious2').expect(400);
        expect(response.body.error).toBe('URL is not safe for redirect');
      });

      it('should not increment clicks for blocked URLs', async () => {
        const url = makeUrl({ shortId: 'malicious1', originalUrl: 'javascript:alert(1)' });
        mockPrismaURL.findFirst.mockResolvedValue(url);

        await request(app).get('/malicious1').expect(400);
        expect(mockPrismaURL.update).not.toHaveBeenCalled();
      });
    });

    describe('error handling', () => {
      it('should return 500 on database error during lookup', async () => {
        mockPrismaURL.findFirst.mockRejectedValue(new Error('Database connection failed'));

        const response = await request(app).get('/abc1234567').expect(500);
        expect(response.body.error).toBe('Failed to redirect');
      });

      it('should return 500 on database error during click update', async () => {
        const url = makeUrl();
        mockPrismaURL.findFirst.mockResolvedValue(url);
        mockPrismaURL.update.mockRejectedValue(new Error('Database error'));

        const response = await request(app).get('/abc1234567').expect(500);
        expect(response.body.error).toBe('Failed to redirect');
      });
    });

    describe('public access', () => {
      it('should not require authentication', async () => {
        const url = makeUrl({ clicks: 0 });
        mockPrismaURL.findFirst.mockResolvedValue(url);
        mockPrismaURL.update.mockResolvedValue({ ...url, clicks: 1 });

        const response = await request(app).get('/abc1234567').expect(302);
        expect(response.headers.location).toBe('https://example.com');
      });
    });
  });

  describe('POST /:shortId/unlock', () => {
    const PASSWORD = 'secret123';
    let passwordHash: string;

    beforeEach(async () => {
      passwordHash = await bcrypt.hash(PASSWORD, 10);
    });

    describe('successful unlock', () => {
      it('should redirect on correct password', async () => {
        const url = makeUrl({ passwordHash });
        mockPrismaURL.findFirst.mockResolvedValue(url);
        mockPrismaURL.update.mockResolvedValue({ ...url, clicks: 6 });

        const response = await request(app)
          .post('/abc1234567/unlock')
          .send({ password: PASSWORD })
          .expect(302);

        expect(response.headers.location).toBe('https://example.com');
      });

      it('should increment clicks on successful unlock', async () => {
        const url = makeUrl({ passwordHash });
        mockPrismaURL.findFirst.mockResolvedValue(url);
        mockPrismaURL.update.mockResolvedValue({ ...url, clicks: 6 });

        await request(app)
          .post('/abc1234567/unlock')
          .send({ password: PASSWORD })
          .expect(302);

        expect(mockPrismaURL.update).toHaveBeenCalledWith({
          where: { shortId: 'abc1234567' },
          data: { clicks: { increment: 1 } },
        });
      });

      it('should publish url_clicked event on successful unlock', async () => {
        const url = makeUrl({ passwordHash });
        mockPrismaURL.findFirst.mockResolvedValue(url);
        mockPrismaURL.update.mockResolvedValue({ ...url, clicks: 6 });

        await request(app)
          .post('/abc1234567/unlock')
          .send({ password: PASSWORD })
          .expect(302);

        expect(mockEventPublisher.publishUrlClicked).toHaveBeenCalledWith({
          shortId: 'abc1234567',
          originalUrl: 'https://example.com',
        });
      });

      it('should respect redirectType on unlock', async () => {
        const url = makeUrl({ passwordHash, redirectType: 301 });
        mockPrismaURL.findFirst.mockResolvedValue(url);
        mockPrismaURL.update.mockResolvedValue({ ...url, clicks: 6 });

        await request(app)
          .post('/abc1234567/unlock')
          .send({ password: PASSWORD })
          .expect(301);
      });
    });

    describe('auth failures', () => {
      it('should return 401 on wrong password', async () => {
        const url = makeUrl({ passwordHash });
        mockPrismaURL.findFirst.mockResolvedValue(url);

        const response = await request(app)
          .post('/abc1234567/unlock')
          .send({ password: 'wrongpassword' })
          .expect(401);

        expect(response.body.error).toBe('Incorrect password.');
      });

      it('should not increment clicks on wrong password', async () => {
        const url = makeUrl({ passwordHash });
        mockPrismaURL.findFirst.mockResolvedValue(url);

        await request(app)
          .post('/abc1234567/unlock')
          .send({ password: 'wrongpassword' })
          .expect(401);

        expect(mockPrismaURL.update).not.toHaveBeenCalled();
      });
    });

    describe('validation', () => {
      it('should return 400 when password is missing', async () => {
        const response = await request(app)
          .post('/abc1234567/unlock')
          .send({})
          .expect(400);

        expect(response.body.error).toBe('Password is required.');
      });

      it('should return 404 for non-existent shortId', async () => {
        mockPrismaURL.findFirst.mockResolvedValue(null);

        const response = await request(app)
          .post('/nonexistent/unlock')
          .send({ password: PASSWORD })
          .expect(404);

        expect(response.body.error).toBe('URL not found');
      });

      it('should return 400 when link is not password protected', async () => {
        const url = makeUrl({ passwordHash: null });
        mockPrismaURL.findFirst.mockResolvedValue(url);

        const response = await request(app)
          .post('/abc1234567/unlock')
          .send({ password: PASSWORD })
          .expect(400);

        expect(response.body.error).toBe('This link is not password protected.');
      });

      it('should return 410 when trying to unlock an expired link', async () => {
        const url = makeUrl({ passwordHash, expiresAt: new Date('2020-01-01') });
        mockPrismaURL.findFirst.mockResolvedValue(url);

        const response = await request(app)
          .post('/abc1234567/unlock')
          .send({ password: PASSWORD })
          .expect(410);

        expect(response.body.error).toBe('This link has expired.');
      });
    });

    describe('error handling', () => {
      it('should return 500 on database error', async () => {
        mockPrismaURL.findFirst.mockRejectedValue(new Error('Database error'));

        const response = await request(app)
          .post('/abc1234567/unlock')
          .send({ password: PASSWORD })
          .expect(500);

        expect(response.body.error).toBe('Failed to unlock');
      });
    });
  });
});
