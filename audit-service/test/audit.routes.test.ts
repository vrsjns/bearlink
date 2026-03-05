import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import jwt from 'jsonwebtoken';

import { createMockPrismaClient, mockPrismaAuditEntry, resetPrismaMocks } from './mocks/prisma';
import { createApp } from '../app';

const VALID_SECRET = 'test-audit-secret';

const generateToken = (user: { id: number; email: string; role: string }) =>
  jwt.sign(user, process.env.JWT_SECRET!, { expiresIn: '1h' });

const adminUser = { id: 1, email: 'admin@example.com', role: 'ADMIN' };
const regularUser = { id: 2, email: 'user@example.com', role: 'USER' };

const sampleEvents = [
  {
    eventId: 'evt-001',
    eventType: 'url_created',
    actorId: '1',
    sourceService: 'url-service',
    payload: { shortId: 'abc123' },
    createdAt: '2024-01-01T00:00:00Z',
  },
  {
    eventId: 'evt-002',
    eventType: 'url_deleted',
    actorId: '1',
    sourceService: 'url-service',
    payload: { shortId: 'xyz789' },
    createdAt: '2024-01-01T00:01:00Z',
  },
];

describe('Audit Routes', () => {
  let app: express.Application;
  let mockPrisma: ReturnType<typeof createMockPrismaClient>;

  beforeEach(() => {
    resetPrismaMocks();
    vi.clearAllMocks();
    mockPrisma = createMockPrismaClient();
    app = createApp({ prisma: mockPrisma });
  });

  describe('POST /internal/audit-events', () => {
    it('should insert new events and return inserted count', async () => {
      mockPrismaAuditEntry.createMany.mockResolvedValue({ count: 2 });

      const res = await request(app)
        .post('/internal/audit-events')
        .set('x-audit-secret', VALID_SECRET)
        .send(sampleEvents)
        .expect(200);

      expect(res.body).toEqual({ received: 2, inserted: 2, skipped: 0 });
      expect(mockPrismaAuditEntry.createMany).toHaveBeenCalledWith({
        data: expect.arrayContaining([
          expect.objectContaining({ eventId: 'evt-001', eventType: 'url_created' }),
        ]),
        skipDuplicates: true,
      });
    });

    it('should report skipped when all eventIds are duplicates', async () => {
      mockPrismaAuditEntry.createMany.mockResolvedValue({ count: 0 });

      const res = await request(app)
        .post('/internal/audit-events')
        .set('x-audit-secret', VALID_SECRET)
        .send(sampleEvents)
        .expect(200);

      expect(res.body).toEqual({ received: 2, inserted: 0, skipped: 2 });
    });

    it('should return 401 when X-Audit-Secret header is missing', async () => {
      const res = await request(app).post('/internal/audit-events').send(sampleEvents).expect(401);

      expect(res.body).toHaveProperty('error');
    });

    it('should return 401 when X-Audit-Secret header is wrong', async () => {
      const res = await request(app)
        .post('/internal/audit-events')
        .set('x-audit-secret', 'wrong-secret')
        .send(sampleEvents)
        .expect(401);

      expect(res.body).toHaveProperty('error');
    });

    it('should return 400 when body is not an array', async () => {
      const res = await request(app)
        .post('/internal/audit-events')
        .set('x-audit-secret', VALID_SECRET)
        .send({ eventId: 'evt-001' })
        .expect(400);

      expect(res.body).toHaveProperty('error');
    });

    it('should return 400 when body is an empty array', async () => {
      const res = await request(app)
        .post('/internal/audit-events')
        .set('x-audit-secret', VALID_SECRET)
        .send([])
        .expect(400);

      expect(res.body).toHaveProperty('error');
    });
  });

  describe('GET /audit', () => {
    it('should return paginated results for admin user', async () => {
      const token = generateToken(adminUser);
      const entries = [
        {
          id: 1,
          eventId: 'evt-001',
          eventType: 'url_created',
          actorId: '1',
          sourceService: 'url-service',
          payload: {},
          createdAt: new Date('2024-01-01'),
        },
      ];
      mockPrismaAuditEntry.findMany.mockResolvedValue(entries);
      mockPrismaAuditEntry.count.mockResolvedValue(1);

      const res = await request(app)
        .get('/audit')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body.data).toHaveLength(1);
      expect(res.body.pagination).toMatchObject({ page: 1, limit: 50, total: 1 });
    });

    it('should apply filters from query params', async () => {
      const token = generateToken(adminUser);
      mockPrismaAuditEntry.findMany.mockResolvedValue([]);
      mockPrismaAuditEntry.count.mockResolvedValue(0);

      await request(app)
        .get('/audit?type=url_created&service=url-service&page=2&limit=10')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(mockPrismaAuditEntry.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            eventType: 'url_created',
            sourceService: 'url-service',
          }),
          skip: 10,
          take: 10,
        })
      );
    });

    it('should return 403 for non-admin user', async () => {
      const token = generateToken(regularUser);

      await request(app).get('/audit').set('Authorization', `Bearer ${token}`).expect(403);
    });

    it('should return 401 when no JWT is provided', async () => {
      await request(app).get('/audit').expect(401);
    });
  });
});
