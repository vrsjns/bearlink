import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import express from 'express';

import { createMockPrismaClient, mockPrismaURL, resetPrismaMocks } from './mocks/prisma';
import { mockEventPublisher, resetRabbitMQMocks } from './mocks/rabbitmq';

// Import the REAL app factory
import { createApp } from '../app';

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
        const url = {
          id: 1,
          shortId: 'abc1234567',
          originalUrl: 'https://example.com',
          userId: 1,
          redirectType: 302,
          clicks: 5,
        };

        mockPrismaURL.findUnique.mockResolvedValue(url);
        mockPrismaURL.update.mockResolvedValue({ ...url, clicks: 6 });

        const response = await request(app)
          .get('/abc1234567')
          .expect(302);

        expect(response.headers.location).toBe('https://example.com');
      });

      it('should redirect with 301 when redirectType is 301', async () => {
        const url = {
          id: 1,
          shortId: 'abc1234567',
          originalUrl: 'https://example.com',
          userId: 1,
          redirectType: 301,
          clicks: 5,
        };

        mockPrismaURL.findUnique.mockResolvedValue(url);
        mockPrismaURL.update.mockResolvedValue({ ...url, clicks: 6 });

        const response = await request(app)
          .get('/abc1234567')
          .expect(301);

        expect(response.headers.location).toBe('https://example.com');
      });

      it('should increment click counter', async () => {
        const url = {
          id: 1,
          shortId: 'abc1234567',
          originalUrl: 'https://example.com',
          userId: 1,
          redirectType: 302,
          clicks: 5,
        };

        mockPrismaURL.findUnique.mockResolvedValue(url);
        mockPrismaURL.update.mockResolvedValue({ ...url, clicks: 6 });

        await request(app)
          .get('/abc1234567')
          .expect(302);

        expect(mockPrismaURL.update).toHaveBeenCalledWith({
          where: { shortId: 'abc1234567' },
          data: { clicks: { increment: 1 } },
        });
      });

      it('should publish url_clicked event', async () => {
        const url = {
          id: 1,
          shortId: 'abc1234567',
          originalUrl: 'https://example.com',
          userId: 1,
          redirectType: 302,
          clicks: 5,
        };

        mockPrismaURL.findUnique.mockResolvedValue(url);
        mockPrismaURL.update.mockResolvedValue({ ...url, clicks: 6 });

        await request(app)
          .get('/abc1234567')
          .expect(302);

        expect(mockEventPublisher.publishUrlClicked).toHaveBeenCalledTimes(1);
        expect(mockEventPublisher.publishUrlClicked).toHaveBeenCalledWith({
          shortId: 'abc1234567',
          originalUrl: 'https://example.com',
        });
      });

      it('should redirect to URLs with query parameters', async () => {
        const url = {
          id: 1,
          shortId: 'abc1234567',
          originalUrl: 'https://example.com/path?query=value&foo=bar',
          userId: 1,
          redirectType: 302,
          clicks: 0,
        };

        mockPrismaURL.findUnique.mockResolvedValue(url);
        mockPrismaURL.update.mockResolvedValue({ ...url, clicks: 1 });

        const response = await request(app)
          .get('/abc1234567')
          .expect(302);

        expect(response.headers.location).toBe('https://example.com/path?query=value&foo=bar');
      });

      it('should redirect to HTTP URLs', async () => {
        const url = {
          id: 1,
          shortId: 'abc1234567',
          originalUrl: 'http://example.com',
          userId: 1,
          redirectType: 302,
          clicks: 0,
        };

        mockPrismaURL.findUnique.mockResolvedValue(url);
        mockPrismaURL.update.mockResolvedValue({ ...url, clicks: 1 });

        const response = await request(app)
          .get('/abc1234567')
          .expect(302);

        expect(response.headers.location).toBe('http://example.com');
      });
    });

    describe('not found', () => {
      it('should return 404 for non-existent shortId', async () => {
        mockPrismaURL.findUnique.mockResolvedValue(null);

        const response = await request(app)
          .get('/nonexistent')
          .expect(404);

        expect(response.body.error).toBe('URL not found');
      });

      it('should not increment clicks for non-existent URL', async () => {
        mockPrismaURL.findUnique.mockResolvedValue(null);

        await request(app)
          .get('/nonexistent')
          .expect(404);

        expect(mockPrismaURL.update).not.toHaveBeenCalled();
      });

      it('should not publish event for non-existent URL', async () => {
        mockPrismaURL.findUnique.mockResolvedValue(null);

        await request(app)
          .get('/nonexistent')
          .expect(404);

        expect(mockEventPublisher.publishUrlClicked).not.toHaveBeenCalled();
      });
    });

    describe('security', () => {
      it('should block javascript: URLs', async () => {
        const url = {
          id: 1,
          shortId: 'malicious1',
          originalUrl: 'javascript:alert(1)',
          userId: 1,
          redirectType: 302,
          clicks: 0,
        };

        mockPrismaURL.findUnique.mockResolvedValue(url);

        const response = await request(app)
          .get('/malicious1')
          .expect(400);

        expect(response.body.error).toBe('URL is not safe for redirect');
      });

      it('should block data: URLs', async () => {
        const url = {
          id: 1,
          shortId: 'malicious2',
          originalUrl: 'data:text/html,<script>alert(1)</script>',
          userId: 1,
          redirectType: 302,
          clicks: 0,
        };

        mockPrismaURL.findUnique.mockResolvedValue(url);

        const response = await request(app)
          .get('/malicious2')
          .expect(400);

        expect(response.body.error).toBe('URL is not safe for redirect');
      });

      it('should not increment clicks for blocked URLs', async () => {
        const url = {
          id: 1,
          shortId: 'malicious1',
          originalUrl: 'javascript:alert(1)',
          userId: 1,
          redirectType: 302,
          clicks: 0,
        };

        mockPrismaURL.findUnique.mockResolvedValue(url);

        await request(app)
          .get('/malicious1')
          .expect(400);

        expect(mockPrismaURL.update).not.toHaveBeenCalled();
      });

      it('should not publish event for blocked URLs', async () => {
        const url = {
          id: 1,
          shortId: 'malicious1',
          originalUrl: 'javascript:alert(1)',
          userId: 1,
          redirectType: 302,
          clicks: 0,
        };

        mockPrismaURL.findUnique.mockResolvedValue(url);

        await request(app)
          .get('/malicious1')
          .expect(400);

        expect(mockEventPublisher.publishUrlClicked).not.toHaveBeenCalled();
      });
    });

    describe('error handling', () => {
      it('should return 500 on database error during lookup', async () => {
        mockPrismaURL.findUnique.mockRejectedValue(new Error('Database connection failed'));

        const response = await request(app)
          .get('/abc1234567')
          .expect(500);

        expect(response.body.error).toBe('Failed to redirect');
      });

      it('should return 500 on database error during click update', async () => {
        const url = {
          id: 1,
          shortId: 'abc1234567',
          originalUrl: 'https://example.com',
          userId: 1,
          redirectType: 302,
          clicks: 5,
        };

        mockPrismaURL.findUnique.mockResolvedValue(url);
        mockPrismaURL.update.mockRejectedValue(new Error('Database error'));

        const response = await request(app)
          .get('/abc1234567')
          .expect(500);

        expect(response.body.error).toBe('Failed to redirect');
      });
    });

    describe('public access', () => {
      it('should not require authentication', async () => {
        const url = {
          id: 1,
          shortId: 'abc1234567',
          originalUrl: 'https://example.com',
          userId: 1,
          redirectType: 302,
          clicks: 0,
        };

        mockPrismaURL.findUnique.mockResolvedValue(url);
        mockPrismaURL.update.mockResolvedValue({ ...url, clicks: 1 });

        // No Authorization header
        const response = await request(app)
          .get('/abc1234567')
          .expect(302);

        expect(response.headers.location).toBe('https://example.com');
      });
    });
  });
});
