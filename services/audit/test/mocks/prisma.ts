import { vi } from 'vitest';

export const mockPrismaAuditEntry = {
  create: vi.fn(),
  createMany: vi.fn(),
  findMany: vi.fn(),
  count: vi.fn(),
};

export const createMockPrismaClient = () => ({
  auditEntry: mockPrismaAuditEntry,
  $disconnect: vi.fn(),
  $queryRaw: vi.fn(),
});

export const resetPrismaMocks = () => {
  Object.values(mockPrismaAuditEntry).forEach((mock) => mock.mockReset());
};
