import { vi } from 'vitest';

export const mockPrismaEvent = {
  create: vi.fn(),
  findMany: vi.fn(),
};

export const createMockPrismaClient = () => ({
  event: mockPrismaEvent,
  $disconnect: vi.fn(),
  $queryRaw: vi.fn(),
});

export const resetPrismaMocks = () => {
  Object.values(mockPrismaEvent).forEach((mock) => mock.mockReset());
};
