import { describe, it, expect, vi, beforeEach } from 'vitest';

// Use vi.hoisted to ensure mocks are available before imports
const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  delete: vi.fn(),
}));

// Mock axios instance
vi.mock('@/lib/axios', () => ({
  default: () => mocks,
}));

// Import after mock is set up
import { getURLs, getURL, createURL, updateURL, deleteURL, downloadQR } from './url';

describe('URL API Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getURLs', () => {
    it('should fetch all URLs with no params', async () => {
      const mockResponse = { data: { data: [{ id: 1, shortCode: 'abc123' }], total: 1 } };
      mocks.get.mockResolvedValue(mockResponse);

      const result = await getURLs();

      expect(mocks.get).toHaveBeenCalledWith('/urls', { params: undefined });
      expect(result).toEqual(mockResponse);
    });

    it('should forward pagination and filter params', async () => {
      const mockResponse = { data: { data: [], total: 0 } };
      mocks.get.mockResolvedValue(mockResponse);

      await getURLs({ page: 2, limit: 10, search: 'foo', tag: 'bar', expired: true });

      expect(mocks.get).toHaveBeenCalledWith('/urls', {
        params: { page: 2, limit: 10, search: 'foo', tag: 'bar', expired: true },
      });
    });
  });

  describe('getURL', () => {
    it('should fetch a single URL by id', async () => {
      const mockResponse = {
        data: { id: 1, shortCode: 'abc123', originalUrl: 'https://example.com' },
      };
      mocks.get.mockResolvedValue(mockResponse);

      const result = await getURL(1);

      expect(mocks.get).toHaveBeenCalledWith('/1');
      expect(result).toEqual(mockResponse);
    });
  });

  describe('createURL', () => {
    it('should create a URL with only originalUrl', async () => {
      const mockResponse = {
        data: { id: 1, shortCode: 'xyz789', originalUrl: 'https://newsite.com' },
      };
      mocks.post.mockResolvedValue(mockResponse);

      const result = await createURL({ originalUrl: 'https://newsite.com' });

      expect(mocks.post).toHaveBeenCalledWith('/urls', { originalUrl: 'https://newsite.com' });
      expect(result).toEqual(mockResponse);
    });

    it('should create a URL with all optional fields', async () => {
      const mockResponse = { data: { id: 2, shortCode: 'my-alias' } };
      mocks.post.mockResolvedValue(mockResponse);

      const options = {
        originalUrl: 'https://example.com',
        customAlias: 'my-alias',
        expiresAt: '2030-01-01T00:00:00.000Z',
        password: 'secret',
        tags: ['a', 'b'],
        redirectType: 301,
        utmParams: { utm_source: 'newsletter' },
      };

      await createURL(options);

      expect(mocks.post).toHaveBeenCalledWith('/urls', options);
    });
  });

  describe('updateURL', () => {
    it('should update an existing URL with originalUrl', async () => {
      const mockResponse = { data: { id: 1, originalUrl: 'https://updated.com' } };
      mocks.put.mockResolvedValue(mockResponse);

      const result = await updateURL(1, { originalUrl: 'https://updated.com' });

      expect(mocks.put).toHaveBeenCalledWith('/urls/1', { originalUrl: 'https://updated.com' });
      expect(result).toEqual(mockResponse);
    });

    it('should update with all optional fields', async () => {
      mocks.put.mockResolvedValue({ data: {} });

      const options = {
        originalUrl: 'https://example.com',
        customAlias: 'new-alias',
        tags: ['x'],
        redirectType: 302,
      };

      await updateURL(5, options);

      expect(mocks.put).toHaveBeenCalledWith('/urls/5', options);
    });
  });

  describe('deleteURL', () => {
    it('should delete a URL', async () => {
      const mockResponse = { data: { success: true } };
      mocks.delete.mockResolvedValue(mockResponse);

      const result = await deleteURL(1);

      expect(mocks.delete).toHaveBeenCalledWith('/urls/1');
      expect(result).toEqual(mockResponse);
    });
  });

  describe('downloadQR', () => {
    it('should fetch QR code as blob', async () => {
      const fakeBlob = new Blob(['png-data'], { type: 'image/png' });
      mocks.get.mockResolvedValue({ data: fakeBlob });

      const result = await downloadQR('abc123');

      expect(mocks.get).toHaveBeenCalledWith('/abc123/qr', { responseType: 'blob' });
      expect(result).toBe(fakeBlob);
    });
  });
});
