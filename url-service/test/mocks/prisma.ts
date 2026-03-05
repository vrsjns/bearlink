import { vi } from 'vitest';

export const mockPrismaURL = {
  create: vi.fn(),
  findUnique: vi.fn(),
  findFirst: vi.fn(),
  findMany: vi.fn(),
  count: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
};

export const mockPrismaOutboxEvent = {
  create: vi.fn(),
  findMany: vi.fn(),
  updateMany: vi.fn(),
};

export const createMockPrismaClient = () => ({
  uRL: mockPrismaURL,
  outboxEvent: mockPrismaOutboxEvent,
  $disconnect: vi.fn(),
  $queryRaw: vi.fn(),
  $transaction: vi.fn((opsOrFn: unknown) => {
    if (typeof opsOrFn === 'function') {
      return (opsOrFn as Function)({
        uRL: mockPrismaURL,
        outboxEvent: mockPrismaOutboxEvent,
      });
    }
    return Promise.all(opsOrFn as Promise<unknown>[]);
  }),
});

export const resetPrismaMocks = () => {
  Object.values(mockPrismaURL).forEach((mock) => mock.mockReset());
  Object.values(mockPrismaOutboxEvent).forEach((mock) => mock.mockReset());
};
