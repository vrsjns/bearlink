import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { createMockPrismaClient, mockPrismaEvent, resetPrismaMocks } from './mocks/prisma';

const { createApp } = require('../app');

const JWT_SECRET = process.env.JWT_SECRET!;

const makeToken = (user: object) => jwt.sign(user, JWT_SECRET, { expiresIn: '1h' });

const adminUser = { id: 1, email: 'admin@example.com', role: 'ADMIN' };
const regularUser = { id: 2, email: 'user@example.com', role: 'USER' };

describe('Analytics Routes', () => {
  let mockPrisma: ReturnType<typeof createMockPrismaClient>;
  let app: any;

  beforeEach(() => {
    mockPrisma = createMockPrismaClient();
    resetPrismaMocks();
    app = createApp({ prisma: mockPrisma });
  });

  // ─── GET /analytics/urls/:shortId/clicks ──────────────────────────────────

  describe('GET /analytics/urls/:shortId/clicks', () => {
    it('should return total and today click counts', async () => {
      const token = makeToken(regularUser);
      mockPrismaEvent.count
        .mockResolvedValueOnce(42) // total
        .mockResolvedValueOnce(5); // today

      const response = await request(app)
        .get('/analytics/urls/abc123/clicks')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body).toEqual({ total: 42, today: 5 });
    });

    it('should query only url_clicked events for the given shortId', async () => {
      const token = makeToken(regularUser);
      mockPrismaEvent.count.mockResolvedValue(0);

      await request(app)
        .get('/analytics/urls/myslug/clicks')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(mockPrismaEvent.count).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            type: 'url_clicked',
            payload: { path: ['shortId'], equals: 'myslug' },
          }),
        })
      );
    });

    it('should return 401 without a token', async () => {
      await request(app).get('/analytics/urls/abc123/clicks').expect(401);
    });

    it('should return 500 on database error', async () => {
      const token = makeToken(regularUser);
      mockPrismaEvent.count.mockRejectedValue(new Error('DB error'));

      const response = await request(app)
        .get('/analytics/urls/abc123/clicks')
        .set('Authorization', `Bearer ${token}`)
        .expect(500);

      expect(response.body.error).toBeDefined();
    });
  });

  // ─── GET /analytics/summary ───────────────────────────────────────────────

  describe('GET /analytics/summary', () => {
    it('should return 403 for non-admin', async () => {
      const token = makeToken(regularUser);

      const response = await request(app)
        .get('/analytics/summary')
        .set('Authorization', `Bearer ${token}`)
        .expect(403);

      expect(response.body.error).toBeDefined();
    });

    it('should return summary counts for admin', async () => {
      const token = makeToken(adminUser);
      mockPrismaEvent.count
        .mockResolvedValueOnce(10) // totalUsers
        .mockResolvedValueOnce(25) // totalUrls
        .mockResolvedValueOnce(100); // totalClicks

      const response = await request(app)
        .get('/analytics/summary')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body).toEqual({ totalUsers: 10, totalUrls: 25, totalClicks: 100 });
    });

    it('should return 401 without a token', async () => {
      await request(app).get('/analytics/summary').expect(401);
    });
  });

  // ─── GET /analytics/top-urls ──────────────────────────────────────────────

  describe('GET /analytics/top-urls', () => {
    it('should return 403 for non-admin', async () => {
      const token = makeToken(regularUser);

      await request(app)
        .get('/analytics/top-urls')
        .set('Authorization', `Bearer ${token}`)
        .expect(403);
    });

    it('should return top URL results for admin', async () => {
      const token = makeToken(adminUser);
      const mockResults = [
        { shortId: 'abc123', clicks: 50 },
        { shortId: 'xyz789', clicks: 30 },
      ];
      mockPrisma.$queryRaw.mockResolvedValue(mockResults);

      const response = await request(app)
        .get('/analytics/top-urls?period=7d&limit=5')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body).toHaveLength(2);
      expect(response.body[0]).toEqual({ shortId: 'abc123', clicks: 50 });
    });

    it('should default limit to 10', async () => {
      const token = makeToken(adminUser);
      mockPrisma.$queryRaw.mockResolvedValue([]);

      await request(app)
        .get('/analytics/top-urls')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      // $queryRaw is called (with template literal args including limit=10)
      expect(mockPrisma.$queryRaw).toHaveBeenCalled();
    });

    it('should return 401 without a token', async () => {
      await request(app).get('/analytics/top-urls').expect(401);
    });

    it('should return 500 on database error', async () => {
      const token = makeToken(adminUser);
      mockPrisma.$queryRaw.mockRejectedValue(new Error('DB error'));

      const response = await request(app)
        .get('/analytics/top-urls')
        .set('Authorization', `Bearer ${token}`)
        .expect(500);

      expect(response.body.error).toBeDefined();
    });
  });
});
