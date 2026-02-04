import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { createMockPrismaClient, mockPrismaEvent, resetPrismaMocks } from './mocks/prisma';

// Import the actual app factory
const { createApp } = require('../app');

describe('Events Routes', () => {
  let mockPrisma: ReturnType<typeof createMockPrismaClient>;
  let app: any;

  beforeEach(() => {
    mockPrisma = createMockPrismaClient();
    resetPrismaMocks();
    app = createApp({ prisma: mockPrisma });
  });

  describe('GET /events', () => {
    describe('successful requests', () => {
      it('should return list of events', async () => {
        const mockEvents = [
          {
            id: 1,
            type: 'user_registered',
            payload: { id: 1, email: 'test@example.com' },
            createdAt: new Date('2026-01-01'),
          },
          {
            id: 2,
            type: 'url_created',
            payload: { shortId: 'abc123' },
            createdAt: new Date('2026-01-02'),
          },
        ];

        mockPrismaEvent.findMany.mockResolvedValue(mockEvents);

        const response = await request(app)
          .get('/events')
          .expect(200);

        expect(response.body).toHaveLength(2);
        expect(response.body[0].type).toBe('user_registered');
        expect(response.body[1].type).toBe('url_created');
        expect(mockPrismaEvent.findMany).toHaveBeenCalled();
      });

      it('should return empty array when no events exist', async () => {
        mockPrismaEvent.findMany.mockResolvedValue([]);

        const response = await request(app)
          .get('/events')
          .expect(200);

        expect(response.body).toEqual([]);
        expect(mockPrismaEvent.findMany).toHaveBeenCalled();
      });

      it('should return events with all fields', async () => {
        const mockEvent = {
          id: 1,
          type: 'user_registered',
          payload: { id: 1, email: 'test@example.com', name: 'Test User' },
          createdAt: new Date('2026-01-01T12:00:00Z'),
        };

        mockPrismaEvent.findMany.mockResolvedValue([mockEvent]);

        const response = await request(app)
          .get('/events')
          .expect(200);

        expect(response.body[0]).toHaveProperty('id');
        expect(response.body[0]).toHaveProperty('type');
        expect(response.body[0]).toHaveProperty('payload');
        expect(response.body[0]).toHaveProperty('createdAt');
      });
    });

    describe('error handling', () => {
      it('should return 500 on database error', async () => {
        mockPrismaEvent.findMany.mockRejectedValue(new Error('Database error'));

        const response = await request(app)
          .get('/events')
          .expect(500);

        expect(response.body).toEqual({ error: 'Failed to fetch events' });
      });

      it('should return 500 on connection timeout', async () => {
        mockPrismaEvent.findMany.mockRejectedValue(new Error('Connection timeout'));

        const response = await request(app)
          .get('/events')
          .expect(500);

        expect(response.body.error).toBe('Failed to fetch events');
      });
    });
  });

  describe('Events Controller', () => {
    const { createEventsController } = require('../controllers/events.controller');

    it('should create controller with prisma dependency', () => {
      const controller = createEventsController({ prisma: mockPrisma });

      expect(controller).toHaveProperty('listEvents');
      expect(typeof controller.listEvents).toBe('function');
    });

    it('should call prisma.event.findMany in listEvents', async () => {
      mockPrismaEvent.findMany.mockResolvedValue([]);

      const controller = createEventsController({ prisma: mockPrisma });

      const mockReq = {};
      const mockRes = {
        json: vi.fn(),
        status: vi.fn().mockReturnThis(),
      };

      await controller.listEvents(mockReq, mockRes);

      expect(mockPrismaEvent.findMany).toHaveBeenCalled();
      expect(mockRes.json).toHaveBeenCalledWith([]);
    });
  });
});
