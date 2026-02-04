import { describe, it, expect, beforeEach } from 'vitest';
import { createMockPrismaClient, mockPrismaEvent, resetPrismaMocks } from './mocks/prisma';

// Import the actual event service
const { createEventHandler } = await import('../services/event.service.js');

describe('Event Service', () => {
  let mockPrisma;

  beforeEach(() => {
    mockPrisma = createMockPrismaClient();
    resetPrismaMocks();
  });

  describe('createEventHandler', () => {
    it('should store user_registered event successfully', async () => {
      mockPrismaEvent.create.mockResolvedValue({
        id: 1,
        type: 'user_registered',
        payload: { id: 1, email: 'test@example.com', name: 'Test User' },
        createdAt: new Date(),
      });

      const handleEvent = createEventHandler({ prisma: mockPrisma });
      const payload = { id: 1, email: 'test@example.com', name: 'Test User' };

      await handleEvent('user_registered', payload);

      expect(mockPrismaEvent.create).toHaveBeenCalledWith({
        data: {
          type: 'user_registered',
          payload,
        },
      });
    });

    it('should store url_created event successfully', async () => {
      mockPrismaEvent.create.mockResolvedValue({
        id: 2,
        type: 'url_created',
        payload: { id: 1, shortId: 'abc123', originalUrl: 'https://example.com', userId: 1 },
        createdAt: new Date(),
      });

      const handleEvent = createEventHandler({ prisma: mockPrisma });
      const payload = {
        id: 1,
        shortId: 'abc123',
        originalUrl: 'https://example.com',
        userId: 1,
      };

      await handleEvent('url_created', payload);

      expect(mockPrismaEvent.create).toHaveBeenCalledWith({
        data: {
          type: 'url_created',
          payload,
        },
      });
    });

    it('should store url_clicked event successfully', async () => {
      mockPrismaEvent.create.mockResolvedValue({
        id: 3,
        type: 'url_clicked',
        payload: { shortId: 'abc123', originalUrl: 'https://example.com' },
        createdAt: new Date(),
      });

      const handleEvent = createEventHandler({ prisma: mockPrisma });
      const payload = {
        shortId: 'abc123',
        originalUrl: 'https://example.com',
      };

      await handleEvent('url_clicked', payload);

      expect(mockPrismaEvent.create).toHaveBeenCalledWith({
        data: {
          type: 'url_clicked',
          payload,
        },
      });
    });

    it('should handle database errors gracefully', async () => {
      mockPrismaEvent.create.mockRejectedValue(new Error('Database connection failed'));

      const handleEvent = createEventHandler({ prisma: mockPrisma });
      const payload = { id: 1, email: 'test@example.com' };

      // Should not throw - errors are logged but not propagated
      await expect(handleEvent('user_registered', payload)).resolves.not.toThrow();

      expect(mockPrismaEvent.create).toHaveBeenCalledWith({
        data: {
          type: 'user_registered',
          payload,
        },
      });
    });

    it('should handle unknown event types', async () => {
      mockPrismaEvent.create.mockResolvedValue({
        id: 4,
        type: 'unknown_event',
        payload: { data: 'test' },
        createdAt: new Date(),
      });

      const handleEvent = createEventHandler({ prisma: mockPrisma });
      const payload = { data: 'test' };

      await handleEvent('unknown_event', payload);

      expect(mockPrismaEvent.create).toHaveBeenCalledWith({
        data: {
          type: 'unknown_event',
          payload,
        },
      });
    });
  });
});
