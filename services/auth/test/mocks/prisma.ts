import { vi } from 'vitest';

export const mockPrismaUser = {
  create: vi.fn(),
  findUnique: vi.fn(),
  findMany: vi.fn(),
  update: vi.fn(),
  updateMany: vi.fn(),
  delete: vi.fn(),
};

export const mockPrismaPasswordResetToken = {
  create: vi.fn(),
  findUnique: vi.fn(),
  update: vi.fn(),
};

export const mockPrismaOutboxEvent = {
  create: vi.fn(),
  findMany: vi.fn(),
  updateMany: vi.fn(),
};

export const createMockPrismaClient = () => ({
  user: mockPrismaUser,
  passwordResetToken: mockPrismaPasswordResetToken,
  outboxEvent: mockPrismaOutboxEvent,
  $disconnect: vi.fn(),
  $queryRaw: vi.fn(),
  // Execute the callback with the mock client so individual model calls inside
  // the transaction are still intercepted by their respective mocks.
  $transaction: vi.fn((opsOrFn: unknown) => {
    if (typeof opsOrFn === 'function') {
      return opsOrFn({
        user: mockPrismaUser,
        passwordResetToken: mockPrismaPasswordResetToken,
        outboxEvent: mockPrismaOutboxEvent,
      });
    }
    // Array of promises: resolve them all in order
    return Promise.all(opsOrFn as Promise<unknown>[]);
  }),
});

export const resetPrismaMocks = () => {
  Object.values(mockPrismaUser).forEach((mock) => mock.mockReset());
  Object.values(mockPrismaPasswordResetToken).forEach((mock) => mock.mockReset());
  Object.values(mockPrismaOutboxEvent).forEach((mock) => mock.mockReset());
};
