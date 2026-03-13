import { vi } from 'vitest';

export const mockRedis = {
  get: vi.fn(),
  set: vi.fn(),
  setex: vi.fn(),
  del: vi.fn(),
  ping: vi.fn(),
};

export const resetRedisMocks = () => {
  Object.values(mockRedis).forEach((mock) => mock.mockReset());
};
