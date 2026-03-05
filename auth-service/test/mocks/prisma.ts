import { vi } from 'vitest';

export const mockPrismaUser = {
  create: vi.fn(),
  findUnique: vi.fn(),
  findMany: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
};

export const mockPrismaPasswordResetToken = {
  create: vi.fn(),
  findUnique: vi.fn(),
  update: vi.fn(),
};

export const createMockPrismaClient = () => ({
  user: mockPrismaUser,
  passwordResetToken: mockPrismaPasswordResetToken,
  $disconnect: vi.fn(),
  $queryRaw: vi.fn(),
});

export const resetPrismaMocks = () => {
  Object.values(mockPrismaUser).forEach((mock) => mock.mockReset());
  Object.values(mockPrismaPasswordResetToken).forEach((mock) => mock.mockReset());
};
