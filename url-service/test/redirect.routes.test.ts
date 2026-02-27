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
  utmParams: null,
  clicks: 5,
  previewTitle: null,
  previewDescription: null,
  previewImageUrl: null,
  previewFetchedAt: null,
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
    app = createApp({ prisma: mockPrisma, eventPublisher: mockEventPublisher, baseUrl });
  });

  // ─── GET /:shortId ────────────────────────────────────────────────────────

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

        await request(app).get('/abc1234567').expect(301);
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

        await request(app)
          .get('/abc1234567')
          .set('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36')
          .expect(302);

        expect(mockPrismaURL.update).toHaveBeenCalledWith({
          where: { shortId: 'abc1234567' },
          data: { clicks: { increment: 1 } },
        });
      });

      it('should not require authentication', async () => {
        const url = makeUrl({ clicks: 0 });
        mockPrismaURL.findFirst.mockResolvedValue(url);
        mockPrismaURL.update.mockResolvedValue({ ...url, clicks: 1 });

        await request(app).get('/abc1234567').expect(302);
      });
    });

    describe('UTM params', () => {
      it('should append utmParams to the redirect destination', async () => {
        const url = makeUrl({ utmParams: { utm_source: 'twitter', utm_medium: 'social' } });
        mockPrismaURL.findFirst.mockResolvedValue(url);
        mockPrismaURL.update.mockResolvedValue({ ...url, clicks: 6 });

        const response = await request(app)
          .get('/abc1234567')
          .set('User-Agent', 'Mozilla/5.0')
          .expect(302);

        const loc = response.headers.location;
        expect(loc).toContain('utm_source=twitter');
        expect(loc).toContain('utm_medium=social');
      });

      it('should redirect to plain originalUrl when utmParams is null', async () => {
        const url = makeUrl({ utmParams: null });
        mockPrismaURL.findFirst.mockResolvedValue(url);
        mockPrismaURL.update.mockResolvedValue({ ...url, clicks: 6 });

        const response = await request(app)
          .get('/abc1234567')
          .set('User-Agent', 'Mozilla/5.0')
          .expect(302);

        expect(response.headers.location).toBe('https://example.com');
      });
    });

    describe('click metadata', () => {
      it('should include referer, userAgent, and country in url_clicked event', async () => {
        const url = makeUrl();
        mockPrismaURL.findFirst.mockResolvedValue(url);
        mockPrismaURL.update.mockResolvedValue({ ...url, clicks: 6 });

        await request(app)
          .get('/abc1234567')
          .set('User-Agent', 'Mozilla/5.0 (compatible; MyBrowser/1.0)')
          .set('Referer', 'https://referring-site.com')
          .expect(302);

        const payload = mockEventPublisher.publishUrlClicked.mock.calls[0][0];
        expect(payload.shortId).toBe('abc1234567');
        expect(payload.originalUrl).toBe('https://example.com');
        expect(payload.userAgent).toBe('Mozilla/5.0 (compatible; MyBrowser/1.0)');
        expect(payload.referer).toBe('https://referring-site.com');
        expect(payload).toHaveProperty('country'); // null for loopback in tests
      });

      it('should set referer to null when no Referer header', async () => {
        const url = makeUrl();
        mockPrismaURL.findFirst.mockResolvedValue(url);
        mockPrismaURL.update.mockResolvedValue({ ...url, clicks: 6 });

        await request(app)
          .get('/abc1234567')
          .set('User-Agent', 'Mozilla/5.0')
          .expect(302);

        const payload = mockEventPublisher.publishUrlClicked.mock.calls[0][0];
        expect(payload.referer).toBeNull();
      });
    });

    describe('bot filtering', () => {
      const bots = [
        ['Googlebot', 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)'],
        ['Slackbot', 'Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)'],
        ['Twitterbot', 'Twitterbot/1.0'],
        ['curl', 'curl/7.68.0'],
      ];

      bots.forEach(([name, ua]) => {
        it(`should not count clicks for ${name}`, async () => {
          const url = makeUrl();
          mockPrismaURL.findFirst.mockResolvedValue(url);

          await request(app)
            .get('/abc1234567')
            .set('User-Agent', ua)
            .expect(302);

          expect(mockPrismaURL.update).not.toHaveBeenCalled();
          expect(mockEventPublisher.publishUrlClicked).not.toHaveBeenCalled();
        });
      });

      it('should still redirect even for bots', async () => {
        const url = makeUrl();
        mockPrismaURL.findFirst.mockResolvedValue(url);

        const response = await request(app)
          .get('/abc1234567')
          .set('User-Agent', 'Googlebot/2.1')
          .expect(302);

        expect(response.headers.location).toBe('https://example.com');
      });

      it('should not count clicks when no User-Agent header', async () => {
        const url = makeUrl();
        mockPrismaURL.findFirst.mockResolvedValue(url);

        await request(app)
          .get('/abc1234567')
          .unset('User-Agent')
          .expect(302);

        expect(mockPrismaURL.update).not.toHaveBeenCalled();
      });

      it('should count clicks for normal browsers', async () => {
        const url = makeUrl();
        mockPrismaURL.findFirst.mockResolvedValue(url);
        mockPrismaURL.update.mockResolvedValue({ ...url, clicks: 6 });

        await request(app)
          .get('/abc1234567')
          .set('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36')
          .expect(302);

        expect(mockPrismaURL.update).toHaveBeenCalledTimes(1);
        expect(mockEventPublisher.publishUrlClicked).toHaveBeenCalledTimes(1);
      });
    });

    describe('expiration', () => {
      it('should return 410 for an expired link', async () => {
        const url = makeUrl({ expiresAt: new Date('2020-01-01') });
        mockPrismaURL.findFirst.mockResolvedValue(url);

        const response = await request(app).get('/abc1234567').expect(410);
        expect(response.body.error).toBe('This link has expired.');
        expect(mockPrismaURL.update).not.toHaveBeenCalled();
      });

      it('should redirect a link that has not yet expired', async () => {
        const url = makeUrl({ expiresAt: new Date(Date.now() + 60_000) });
        mockPrismaURL.findFirst.mockResolvedValue(url);
        mockPrismaURL.update.mockResolvedValue({ ...url, clicks: 6 });

        await request(app)
          .get('/abc1234567')
          .set('User-Agent', 'Mozilla/5.0')
          .expect(302);
      });
    });

    describe('password protection', () => {
      it('should return 401 with requiresPassword flag for protected links', async () => {
        const url = makeUrl({ passwordHash: '$2b$10$hashedpassword' });
        mockPrismaURL.findFirst.mockResolvedValue(url);

        const response = await request(app).get('/abc1234567').expect(401);
        expect(response.body.requiresPassword).toBe(true);
        expect(mockPrismaURL.update).not.toHaveBeenCalled();
      });
    });

    describe('preview page', () => {
      it('should return HTML page for ?preview=1', async () => {
        const url = makeUrl({ previewTitle: 'Example Site', previewDescription: 'A great example' });
        mockPrismaURL.findFirst.mockResolvedValue(url);

        const response = await request(app)
          .get('/abc1234567?preview=1')
          .expect(200);

        expect(response.headers['content-type']).toMatch(/html/);
        expect(response.text).toContain('https://example.com');
        expect(response.text).toContain('Example Site');
      });

      it('should not count a click for ?preview=1', async () => {
        const url = makeUrl();
        mockPrismaURL.findFirst.mockResolvedValue(url);

        await request(app)
          .get('/abc1234567?preview=1')
          .set('User-Agent', 'Mozilla/5.0')
          .expect(200);

        expect(mockPrismaURL.update).not.toHaveBeenCalled();
        expect(mockEventPublisher.publishUrlClicked).not.toHaveBeenCalled();
      });

      it('should include UTM-appended destination in the preview page', async () => {
        const url = makeUrl({ utmParams: { utm_source: 'newsletter' } });
        mockPrismaURL.findFirst.mockResolvedValue(url);

        const response = await request(app)
          .get('/abc1234567?preview=1')
          .expect(200);

        expect(response.text).toContain('utm_source=newsletter');
      });

      it('should return 401 for password-protected link even with ?preview=1', async () => {
        const url = makeUrl({ passwordHash: '$2b$10$hashedpassword' });
        mockPrismaURL.findFirst.mockResolvedValue(url);

        const response = await request(app).get('/abc1234567?preview=1').expect(401);
        expect(response.body.requiresPassword).toBe(true);
      });

      it('should return 410 for expired link with ?preview=1', async () => {
        const url = makeUrl({ expiresAt: new Date('2020-01-01') });
        mockPrismaURL.findFirst.mockResolvedValue(url);

        await request(app).get('/abc1234567?preview=1').expect(410);
      });

      it('should escape HTML entities in preview content to prevent XSS', async () => {
        const url = makeUrl({
          originalUrl: 'https://example.com',
          previewTitle: '<script>alert(1)</script>',
        });
        mockPrismaURL.findFirst.mockResolvedValue(url);

        const response = await request(app).get('/abc1234567?preview=1').expect(200);
        expect(response.text).not.toContain('<script>alert(1)</script>');
        expect(response.text).toContain('&lt;script&gt;');
      });
    });

    describe('not found', () => {
      it('should return 404 for non-existent shortId', async () => {
        mockPrismaURL.findFirst.mockResolvedValue(null);

        const response = await request(app).get('/nonexistent').expect(404);
        expect(response.body.error).toBe('URL not found');
        expect(mockPrismaURL.update).not.toHaveBeenCalled();
      });
    });

    describe('security', () => {
      it('should block javascript: URLs', async () => {
        const url = makeUrl({ shortId: 'malicious1', originalUrl: 'javascript:alert(1)' });
        mockPrismaURL.findFirst.mockResolvedValue(url);

        const response = await request(app).get('/malicious1').expect(400);
        expect(response.body.error).toBe('URL is not safe for redirect');
        expect(mockPrismaURL.update).not.toHaveBeenCalled();
      });

      it('should block data: URLs', async () => {
        const url = makeUrl({ shortId: 'malicious2', originalUrl: 'data:text/html,<h1>x</h1>' });
        mockPrismaURL.findFirst.mockResolvedValue(url);

        await request(app).get('/malicious2').expect(400);
      });
    });

    describe('error handling', () => {
      it('should return 500 on database error during lookup', async () => {
        mockPrismaURL.findFirst.mockRejectedValue(new Error('DB error'));

        const response = await request(app).get('/abc1234567').expect(500);
        expect(response.body.error).toBe('Failed to redirect');
      });

      it('should return 500 on database error during click update', async () => {
        const url = makeUrl();
        mockPrismaURL.findFirst.mockResolvedValue(url);
        mockPrismaURL.update.mockRejectedValue(new Error('DB error'));

        const response = await request(app)
          .get('/abc1234567')
          .set('User-Agent', 'Mozilla/5.0')
          .expect(500);
        expect(response.body.error).toBe('Failed to redirect');
      });
    });
  });

  // ─── GET /:shortId/qr ─────────────────────────────────────────────────────

  describe('GET /:shortId/qr', () => {
    describe('successful QR generation', () => {
      it('should return a PNG image', async () => {
        const url = makeUrl();
        mockPrismaURL.findFirst.mockResolvedValue(url);

        const response = await request(app).get('/abc1234567/qr').expect(200);
        expect(response.headers['content-type']).toMatch(/image\/png/);
        expect(response.body.length).toBeGreaterThan(0);
      });

      it('should work with customAlias', async () => {
        const url = makeUrl({ customAlias: 'my-brand' });
        mockPrismaURL.findFirst.mockResolvedValue(url);

        const response = await request(app).get('/my-brand/qr').expect(200);
        expect(response.headers['content-type']).toMatch(/image\/png/);
      });
    });

    describe('error cases', () => {
      it('should return 404 for non-existent shortId', async () => {
        mockPrismaURL.findFirst.mockResolvedValue(null);

        const response = await request(app).get('/nonexistent/qr').expect(404);
        expect(response.body.error).toBe('URL not found');
      });

      it('should return 410 for an expired link', async () => {
        const url = makeUrl({ expiresAt: new Date('2020-01-01') });
        mockPrismaURL.findFirst.mockResolvedValue(url);

        const response = await request(app).get('/abc1234567/qr').expect(410);
        expect(response.body.error).toBe('This link has expired.');
      });

      it('should return 500 on database error', async () => {
        mockPrismaURL.findFirst.mockRejectedValue(new Error('DB error'));

        const response = await request(app).get('/abc1234567/qr').expect(500);
        expect(response.body.error).toBe('Failed to generate QR code');
      });
    });
  });

  // ─── POST /:shortId/unlock ────────────────────────────────────────────────

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
          .set('User-Agent', 'Mozilla/5.0')
          .send({ password: PASSWORD })
          .expect(302);

        expect(response.headers.location).toBe('https://example.com');
      });

      it('should apply utmParams to unlock destination', async () => {
        const url = makeUrl({ passwordHash, utmParams: { utm_source: 'email' } });
        mockPrismaURL.findFirst.mockResolvedValue(url);
        mockPrismaURL.update.mockResolvedValue({ ...url, clicks: 6 });

        const response = await request(app)
          .post('/abc1234567/unlock')
          .set('User-Agent', 'Mozilla/5.0')
          .send({ password: PASSWORD })
          .expect(302);

        expect(response.headers.location).toContain('utm_source=email');
      });

      it('should include click metadata in url_clicked event on unlock', async () => {
        const url = makeUrl({ passwordHash });
        mockPrismaURL.findFirst.mockResolvedValue(url);
        mockPrismaURL.update.mockResolvedValue({ ...url, clicks: 6 });

        await request(app)
          .post('/abc1234567/unlock')
          .set('User-Agent', 'Mozilla/5.0 (MyBrowser)')
          .set('Referer', 'https://source.com')
          .send({ password: PASSWORD })
          .expect(302);

        const payload = mockEventPublisher.publishUrlClicked.mock.calls[0][0];
        expect(payload.userAgent).toBe('Mozilla/5.0 (MyBrowser)');
        expect(payload.referer).toBe('https://source.com');
        expect(payload).toHaveProperty('country');
      });

      it('should increment clicks on successful unlock', async () => {
        const url = makeUrl({ passwordHash });
        mockPrismaURL.findFirst.mockResolvedValue(url);
        mockPrismaURL.update.mockResolvedValue({ ...url, clicks: 6 });

        await request(app)
          .post('/abc1234567/unlock')
          .set('User-Agent', 'Mozilla/5.0')
          .send({ password: PASSWORD })
          .expect(302);

        expect(mockPrismaURL.update).toHaveBeenCalledWith({
          where: { shortId: 'abc1234567' },
          data: { clicks: { increment: 1 } },
        });
      });

      it('should respect redirectType on unlock', async () => {
        const url = makeUrl({ passwordHash, redirectType: 301 });
        mockPrismaURL.findFirst.mockResolvedValue(url);
        mockPrismaURL.update.mockResolvedValue({ ...url, clicks: 6 });

        await request(app)
          .post('/abc1234567/unlock')
          .set('User-Agent', 'Mozilla/5.0')
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

        await request(app)
          .post('/nonexistent/unlock')
          .send({ password: PASSWORD })
          .expect(404);
      });

      it('should return 400 when link is not password protected', async () => {
        const url = makeUrl({ passwordHash: null });
        mockPrismaURL.findFirst.mockResolvedValue(url);

        await request(app)
          .post('/abc1234567/unlock')
          .send({ password: PASSWORD })
          .expect(400);
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
