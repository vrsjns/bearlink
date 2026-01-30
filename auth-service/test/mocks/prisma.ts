import { vi } from 'vitest';

export const mockPrismaUser = {
  create: vi.fn(),
  findUnique: vi.fn(),
  findMany: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
};

export const createMockPrismaClient = () => ({
  user: mockPrismaUser,
  $disconnect: vi.fn(),
  $queryRaw: vi.fn(),
});

export const resetPrismaMocks = () => {
  Object.values(mockPrismaUser).forEach((mock) => mock.mockReset());
};
