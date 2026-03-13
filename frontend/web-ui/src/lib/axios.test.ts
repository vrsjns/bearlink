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
  let responseInterceptor: { onFulfilled: Function; onRejected: Function };

  beforeEach(() => {
    vi.clearAllMocks();

    vi.mocked(axios.create).mockImplementation(() => {
      mockInstance = {
        interceptors: {
          request: {
            use: vi.fn(),
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
    it('should create axios instance with baseURL and withCredentials', () => {
      createInstance('http://api.test.com');

      expect(axios.create).toHaveBeenCalledWith({
        baseURL: 'http://api.test.com',
        withCredentials: true,
        headers: {
          'Content-Type': 'application/json',
        },
      });
    });

    it('should handle undefined API_URL', () => {
      createInstance(undefined);

      expect(axios.create).toHaveBeenCalledWith({
        baseURL: undefined,
        withCredentials: true,
        headers: {
          'Content-Type': 'application/json',
        },
      });
    });
  });

  describe('response interceptor', () => {
    it('should pass through successful responses', () => {
      createInstance('http://api.test.com');

      const response = { data: { success: true }, status: 200 };
      const result = responseInterceptor.onFulfilled(response);

      expect(result).toBe(response);
    });

    it('should handle 401 error by removing user and redirecting', async () => {
      createInstance('http://api.test.com');

      const error = {
        response: { status: 401 },
      };

      const originalLocation = window.location;
      delete (window as any).location;
      window.location = { href: '' } as any;

      await expect(responseInterceptor.onRejected(error)).rejects.toEqual(error);

      expect(localStorage.removeItem).toHaveBeenCalledWith('user');
      expect(window.location.href).toBe('/login');

      window.location = originalLocation;
    });

    it('should not redirect for non-401 errors', async () => {
      createInstance('http://api.test.com');

      const error = {
        response: { status: 500 },
      };

      await expect(responseInterceptor.onRejected(error)).rejects.toEqual(error);

      expect(localStorage.removeItem).not.toHaveBeenCalled();
    });

    it('should handle errors without response', async () => {
      createInstance('http://api.test.com');

      const error = new Error('Network error');

      await expect(responseInterceptor.onRejected(error)).rejects.toThrow('Network error');
    });
  });
});
