import { describe, it, expect, vi, beforeEach } from 'vitest';
import { logout, isAuthenticated } from './auth';

// Note: login/register tests require proper MSW setup with environment variables
// These tests focus on synchronous functions that don't make network requests

vi.mock('@/lib/axios', () => ({
  default: vi.fn(() => ({
    post: vi.fn().mockResolvedValue({}),
    get: vi.fn(),
    put: vi.fn(),
    interceptors: {
      request: { use: vi.fn() },
      response: { use: vi.fn() },
    },
  })),
}));

describe('Auth Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (localStorage.getItem as ReturnType<typeof vi.fn>).mockReturnValue(null);
  });

  describe('logout', () => {
    it('should remove user from localStorage', async () => {
      await logout();

      expect(localStorage.removeItem).toHaveBeenCalledWith('user');
    });
  });

  describe('isAuthenticated', () => {
    it('should return true when user exists in localStorage', () => {
      (localStorage.getItem as ReturnType<typeof vi.fn>).mockReturnValue(JSON.stringify({ id: 1 }));

      expect(isAuthenticated()).toBe(true);
    });

    it('should return false when no user in localStorage', () => {
      (localStorage.getItem as ReturnType<typeof vi.fn>).mockReturnValue(null);

      expect(isAuthenticated()).toBe(false);
    });

    it('should check localStorage for user', () => {
      isAuthenticated();

      expect(localStorage.getItem).toHaveBeenCalledWith('user');
    });
  });
});
