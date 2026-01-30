import { describe, it, expect, vi, beforeEach } from 'vitest';
import { logout, isAuthenticated } from './auth';

// Note: login/register tests require proper MSW setup with environment variables
// These tests focus on synchronous functions that don't make network requests

describe('Auth Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (localStorage.getItem as ReturnType<typeof vi.fn>).mockReturnValue(null);
  });

  describe('logout', () => {
    it('should remove token from localStorage', () => {
      logout();

      expect(localStorage.removeItem).toHaveBeenCalledWith('token');
    });
  });

  describe('isAuthenticated', () => {
    it('should return true when token exists', () => {
      (localStorage.getItem as ReturnType<typeof vi.fn>).mockReturnValue('some-token');

      expect(isAuthenticated()).toBe(true);
    });

    it('should return false when no token exists', () => {
      (localStorage.getItem as ReturnType<typeof vi.fn>).mockReturnValue(null);

      expect(isAuthenticated()).toBe(false);
    });

    it('should check localStorage for token', () => {
      isAuthenticated();

      expect(localStorage.getItem).toHaveBeenCalledWith('token');
    });
  });
});
