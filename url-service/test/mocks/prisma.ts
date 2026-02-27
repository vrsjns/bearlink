import { vi } from 'vitest';

export const mockPrismaURL = {
  create: vi.fn(),
  findUnique: vi.fn(),
  findFirst: vi.fn(),
  findMany: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
};

export const createMockPrismaClient = () => ({
  uRL: mockPrismaURL,
  $disconnect: vi.fn(),
  $queryRaw: vi.fn(),
});

export const resetPrismaMocks = () => {
  Object.values(mockPrismaURL).forEach((mock) => mock.mockReset());
};
