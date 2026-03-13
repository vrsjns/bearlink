import { describe, it, expect, beforeEach } from 'vitest';
import { createMockPrismaClient, mockPrismaEvent, resetPrismaMocks } from './mocks/prisma';

const { runCleanup } = await import('../services/cleanup.service.js');

describe('Cleanup Service', () => {
  let mockPrisma;

  beforeEach(() => {
    mockPrisma = createMockPrismaClient();
    resetPrismaMocks();
  });

  it('should delete events older than the retention period', async () => {
    mockPrismaEvent.deleteMany.mockResolvedValue({ count: 5 });

    const result = await runCleanup(mockPrisma, 90);

    expect(result).toBe(5);
    expect(mockPrismaEvent.deleteMany).toHaveBeenCalledWith({
      where: { createdAt: { lt: expect.any(Date) } },
    });
  });

  it('should pass a cutoff date in the past', async () => {
    mockPrismaEvent.deleteMany.mockResolvedValue({ count: 0 });
    const before = Date.now();

    await runCleanup(mockPrisma, 30);

    const call = mockPrismaEvent.deleteMany.mock.calls[0][0];
    const cutoff = call.where.createdAt.lt;

    expect(cutoff.getTime()).toBeLessThan(before);
    // cutoff should be approximately 30 days ago
    const expectedMs = before - 30 * 86400_000;
    expect(Math.abs(cutoff.getTime() - expectedMs)).toBeLessThan(5000);
  });

  it('should return 0 when no events are deleted', async () => {
    mockPrismaEvent.deleteMany.mockResolvedValue({ count: 0 });

    const result = await runCleanup(mockPrisma, 90);

    expect(result).toBe(0);
  });
});
