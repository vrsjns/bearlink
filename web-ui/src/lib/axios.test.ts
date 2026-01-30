import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import axios from 'axios';
import createInstance from './axios';

// Mock axios
vi.mock('axios', () => {
  const mockInterceptors = {
    request: {
      use: vi.fn(),
    },
    response: {
      use: vi.fn(),
    },
  };

  return {
    default: {
      create: vi.fn(() => ({
        interceptors: mockInterceptors,
      })),
    },
  };
});

describe('Axios Instance', () => {
  let mockInstance: any;
  let requestInterceptor: { onFulfilled: Function; onRejected: Function };
  let responseInterceptor: { onFulfilled: Function; onRejected: Function };

  beforeEach(() => {
    vi.clearAllMocks();

    // Capture the interceptors when they're registered
    vi.mocked(axios.create).mockImplementation(() => {
      mockInstance = {
        interceptors: {
          request: {
            use: vi.fn((onFulfilled, onRejected) => {
              requestInterceptor = { onFulfilled, onRejected };
            }),
          },
          response: {
            use: vi.fn((onFulfilled, onRejected) => {
              responseInterceptor = { onFulfilled, onRejected };
            }),
          },
        },
      };
      return mockInstance as any;
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('createInstance', () => {
    it('should create axios instance with baseURL', () => {
      createInstance('http://api.test.com');

      expect(axios.create).toHaveBeenCalledWith({
        baseURL: 'http://api.test.com',
        headers: {
          'Content-Type': 'application/json',
        },
      });
    });

    it('should handle undefined API_URL', () => {
      createInstance(undefined);

      expect(axios.create).toHaveBeenCalledWith({
        baseURL: undefined,
        headers: {
          'Content-Type': 'application/json',
        },
      });
    });
  });

  describe('request interceptor', () => {
    it('should add token to Authorization header when token exists', () => {
      (localStorage.getItem as ReturnType<typeof vi.fn>).mockReturnValue('test-token');

      createInstance('http://api.test.com');

      const config = { headers: {} } as any;
      const result = requestInterceptor.onFulfilled(config);

      expect(result.headers.Authorization).toBe('Bearer test-token');
    });

    it('should not add Authorization header when no token', () => {
      (localStorage.getItem as ReturnType<typeof vi.fn>).mockReturnValue(null);

      createInstance('http://api.test.com');

      const config = { headers: {} } as any;
      const result = requestInterceptor.onFulfilled(config);

      expect(result.headers.Authorization).toBeUndefined();
    });

    it('should reject on request error', async () => {
      createInstance('http://api.test.com');

      const error = new Error('Request failed');

      await expect(requestInterceptor.onRejected(error)).rejects.toThrow('Request failed');
    });
  });

  describe('response interceptor', () => {
    it('should pass through successful responses', () => {
      createInstance('http://api.test.com');

      const response = { data: { success: true }, status: 200 };
      const result = responseInterceptor.onFulfilled(response);

      expect(result).toBe(response);
    });

    it('should handle 401 error by removing token and redirecting', async () => {
      createInstance('http://api.test.com');

      const error = {
        response: { status: 401 },
      };

      // Mock window.location
      const originalLocation = window.location;
      delete (window as any).location;
      window.location = { href: '' } as any;

      await expect(responseInterceptor.onRejected(error)).rejects.toEqual(error);

      expect(localStorage.removeItem).toHaveBeenCalledWith('token');
      expect(window.location.href).toBe('/login');

      // Restore
      window.location = originalLocation;
    });

    it('should not redirect for non-401 errors', async () => {
      createInstance('http://api.test.com');

      const error = {
        response: { status: 500 },
      };

      const originalHref = window.location.href;

      await expect(responseInterceptor.onRejected(error)).rejects.toEqual(error);

      // Should not have redirected
      expect(localStorage.removeItem).not.toHaveBeenCalled();
    });

    it('should handle errors without response', async () => {
      createInstance('http://api.test.com');

      const error = new Error('Network error');

      await expect(responseInterceptor.onRejected(error)).rejects.toThrow('Network error');
    });
  });
});
