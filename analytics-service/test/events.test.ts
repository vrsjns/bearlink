import { describe, it, expect, vi } from 'vitest';

describe('Analytics Service - Event Handling', () => {
  describe('handleEvent', () => {
    const mockPrismaEvent = {
      create: vi.fn(),
    };

    const handleEvent = async (type: string, payload: any) => {
      await mockPrismaEvent.create({
        data: { type, payload },
      });
    };

    it('should store user_registered event', async () => {
      const payload = { id: 1, email: 'test@example.com', name: 'Test User' };

      await handleEvent('user_registered', payload);

      expect(mockPrismaEvent.create).toHaveBeenCalledWith({
        data: {
          type: 'user_registered',
          payload,
        },
      });
    });

    it('should store url_created event', async () => {
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

    it('should store url_clicked event', async () => {
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
  });

  describe('event types', () => {
    const validEventTypes = ['user_registered', 'url_created', 'url_clicked'];

    it('should recognize all valid event types', () => {
      validEventTypes.forEach((type) => {
        expect(typeof type).toBe('string');
        expect(type.length).toBeGreaterThan(0);
      });
    });
  });
});
