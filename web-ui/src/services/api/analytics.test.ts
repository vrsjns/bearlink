import { describe, it, expect, vi } from 'vitest';

// Mock the axios module
vi.mock('@/lib/axios', () => ({
  default: vi.fn(() => ({
    get: vi.fn(),
    post: vi.fn(),
  })),
}));

describe('Analytics API Service', () => {
  it('should create analytics API client', async () => {
    // Import after mock is set up
    const module = await import('./analytics');

    // The module exports an axios instance (analyticsApiClient)
    // We verify the module loads without error
    expect(module).toBeDefined();
  });
});
