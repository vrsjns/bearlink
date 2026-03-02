import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { createMockPrismaClient, mockPrismaEvent, resetPrismaMocks } from './mocks/prisma';

const { createApp } = require('../app');

const JWT_SECRET = process.env.JWT_SECRET!;

const makeToken = (user: object) => jwt.sign(user, JWT_SECRET, { expiresIn: '1h' });

const adminUser = { id: 1, email: 'admin@example.com', role: 'ADMIN' };
const regularUser = { id: 2, email: 'user@example.com', role: 'USER' };

describe('Events Routes', () => {
  let mockPrisma: ReturnType<typeof createMockPrismaClient>;
  let app: any;

  beforeEach(() => {
    mockPrisma = createMockPrismaClient();
    resetPrismaMocks();
    app = createApp({ prisma: mockPrisma });
  });

  describe('GET /events — auth', () => {
    it('should return 401 without a token', async () => {
      const response = await request(app).get('/events').expect(401);
      expect(response.body.error).toBeDefined();
    });

    it('should return 403 with an invalid token', async () => {
      const response = await request(app)
        .get('/events')
        .set('Authorization', 'Bearer invalid.token.here')
        .expect(403);
      expect(response.body.error).toBeDefined();
    });
  });

  describe('GET /events — successful requests', () => {
    it('should return paginated events for admin', async () => {
      const token = makeToken(adminUser);
      const mockEvents = [
        {
          id: 1,
          type: 'user_registered',
          payload: { id: 1, email: 'a@example.com' },
          createdAt: new Date('2026-01-01'),
        },
        {
          id: 2,
          type: 'url_created',
          payload: { shortId: 'abc123', userId: 1 },
          createdAt: new Date('2026-01-02'),
        },
      ];
      mockPrismaEvent.findMany.mockResolvedValue(mockEvents);
      mockPrismaEvent.count.mockResolvedValue(2);

      const response = await request(app)
        .get('/events')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body.data).toHaveLength(2);
      expect(response.body.pagination).toMatchObject({ page: 1, limit: 50, total: 2 });
      expect(response.body.data[0].type).toBe('user_registered');
    });

    it('should return empty data array when no events exist', async () => {
      const token = makeToken(adminUser);
      mockPrismaEvent.findMany.mockResolvedValue([]);
      mockPrismaEvent.count.mockResolvedValue(0);

      const response = await request(app)
        .get('/events')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body.data).toEqual([]);
      expect(response.body.pagination.total).toBe(0);
    });

    it('should return events with all fields', async () => {
      const token = makeToken(adminUser);
      const mockEvent = {
        id: 1,
        type: 'user_registered',
        payload: { id: 1, email: 'test@example.com', name: 'Test User' },
        createdAt: new Date('2026-01-01T12:00:00Z'),
      };
      mockPrismaEvent.findMany.mockResolvedValue([mockEvent]);
      mockPrismaEvent.count.mockResolvedValue(1);

      const response = await request(app)
        .get('/events')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body.data[0]).toHaveProperty('id');
      expect(response.body.data[0]).toHaveProperty('type');
      expect(response.body.data[0]).toHaveProperty('payload');
      expect(response.body.data[0]).toHaveProperty('createdAt');
    });
  });

  describe('GET /events — role scoping', () => {
    it('should pass userId filter for regular users', async () => {
      const token = makeToken(regularUser);
      mockPrismaEvent.findMany.mockResolvedValue([]);
      mockPrismaEvent.count.mockResolvedValue(0);

      await request(app).get('/events').set('Authorization', `Bearer ${token}`).expect(200);

      expect(mockPrismaEvent.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            AND: [{ payload: { path: ['userId'], equals: regularUser.id } }],
          },
        })
      );
    });

    it('should not restrict admin to a specific user', async () => {
      const token = makeToken(adminUser);
      mockPrismaEvent.findMany.mockResolvedValue([]);
      mockPrismaEvent.count.mockResolvedValue(0);

      await request(app).get('/events').set('Authorization', `Bearer ${token}`).expect(200);

      expect(mockPrismaEvent.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: {} }));
    });
  });

  describe('GET /events — pagination', () => {
    it('should default to page 1 and limit 50', async () => {
      const token = makeToken(adminUser);
      mockPrismaEvent.findMany.mockResolvedValue([]);
      mockPrismaEvent.count.mockResolvedValue(0);

      await request(app).get('/events').set('Authorization', `Bearer ${token}`).expect(200);

      expect(mockPrismaEvent.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 0, take: 50 })
      );
    });

    it('should apply custom page and limit', async () => {
      const token = makeToken(adminUser);
      mockPrismaEvent.findMany.mockResolvedValue([]);
      mockPrismaEvent.count.mockResolvedValue(0);

      const response = await request(app)
        .get('/events?page=2&limit=10')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(mockPrismaEvent.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 10, take: 10 })
      );
      expect(response.body.pagination).toMatchObject({ page: 2, limit: 10 });
    });

    it('should cap limit at 100', async () => {
      const token = makeToken(adminUser);
      mockPrismaEvent.findMany.mockResolvedValue([]);
      mockPrismaEvent.count.mockResolvedValue(0);

      await request(app)
        .get('/events?limit=500')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(mockPrismaEvent.findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 100 }));
    });
  });

  describe('GET /events — filtering', () => {
    it('should filter by type', async () => {
      const token = makeToken(adminUser);
      mockPrismaEvent.findMany.mockResolvedValue([]);
      mockPrismaEvent.count.mockResolvedValue(0);

      await request(app)
        .get('/events?type=url_clicked')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(mockPrismaEvent.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { AND: [{ type: 'url_clicked' }] },
        })
      );
    });

    it('should filter by from/to date range', async () => {
      const token = makeToken(adminUser);
      mockPrismaEvent.findMany.mockResolvedValue([]);
      mockPrismaEvent.count.mockResolvedValue(0);

      await request(app)
        .get('/events?from=2026-01-01&to=2026-01-31')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(mockPrismaEvent.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            AND: [{ createdAt: { gte: new Date('2026-01-01'), lte: new Date('2026-01-31') } }],
          },
        })
      );
    });

    it('should allow admin to filter by userId', async () => {
      const token = makeToken(adminUser);
      mockPrismaEvent.findMany.mockResolvedValue([]);
      mockPrismaEvent.count.mockResolvedValue(0);

      await request(app)
        .get('/events?userId=5')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(mockPrismaEvent.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { AND: [{ payload: { path: ['userId'], equals: 5 } }] },
        })
      );
    });

    it('should ignore userId filter for regular users (scoping already applies)', async () => {
      const token = makeToken(regularUser);
      mockPrismaEvent.findMany.mockResolvedValue([]);
      mockPrismaEvent.count.mockResolvedValue(0);

      await request(app)
        .get('/events?userId=5')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      // Only the user-scoping AND clause, not a separate userId filter
      expect(mockPrismaEvent.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { AND: [{ payload: { path: ['userId'], equals: regularUser.id } }] },
        })
      );
    });
  });

  describe('GET /events — error handling', () => {
    it('should return 500 on database error', async () => {
      const token = makeToken(adminUser);
      mockPrismaEvent.findMany.mockRejectedValue(new Error('Database error'));
      mockPrismaEvent.count.mockResolvedValue(0);

      const response = await request(app)
        .get('/events')
        .set('Authorization', `Bearer ${token}`)
        .expect(500);

      expect(response.body).toEqual({ error: 'Failed to fetch events' });
    });
  });

  describe('Events Controller', () => {
    const { createEventsController } = require('../controllers/events.controller');

    it('should create controller with prisma dependency', () => {
      const controller = createEventsController({ prisma: mockPrisma });

      expect(controller).toHaveProperty('listEvents');
      expect(typeof controller.listEvents).toBe('function');
    });

    it('should call prisma.event.findMany and count in listEvents', async () => {
      mockPrismaEvent.findMany.mockResolvedValue([]);
      mockPrismaEvent.count.mockResolvedValue(0);

      const controller = createEventsController({ prisma: mockPrisma });

      const mockReq = { user: { id: 1, role: 'ADMIN' }, query: {} };
      const mockRes = {
        json: vi.fn(),
        status: vi.fn().mockReturnThis(),
      };

      await controller.listEvents(mockReq, mockRes);

      expect(mockPrismaEvent.findMany).toHaveBeenCalled();
      expect(mockPrismaEvent.count).toHaveBeenCalled();
      expect(mockRes.json).toHaveBeenCalledWith({
        data: [],
        pagination: { page: 1, limit: 50, total: 0 },
      });
    });
  });
});
