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
import { getURLs, getURL, createURL, updateURL, deleteURL } from './url';

describe('URL API Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getURLs', () => {
    it('should fetch all URLs', async () => {
      const mockResponse = { data: [{ id: 1, shortCode: 'abc123' }] };
      mocks.get.mockResolvedValue(mockResponse);

      const result = await getURLs();

      expect(mocks.get).toHaveBeenCalledWith('/urls');
      expect(result).toEqual(mockResponse);
    });
  });

  describe('getURL', () => {
    it('should fetch a single URL by id', async () => {
      const mockResponse = { data: { id: 1, shortCode: 'abc123', originalUrl: 'https://example.com' } };
      mocks.get.mockResolvedValue(mockResponse);

      const result = await getURL(1);

      expect(mocks.get).toHaveBeenCalledWith('/1');
      expect(result).toEqual(mockResponse);
    });
  });

  describe('createURL', () => {
    it('should create a new shortened URL', async () => {
      const mockResponse = { data: { id: 1, shortCode: 'xyz789', originalUrl: 'https://newsite.com' } };
      mocks.post.mockResolvedValue(mockResponse);

      const result = await createURL('https://newsite.com');

      expect(mocks.post).toHaveBeenCalledWith('/urls', { originalUrl: 'https://newsite.com' });
      expect(result).toEqual(mockResponse);
    });
  });

  describe('updateURL', () => {
    it('should update an existing URL', async () => {
      const mockResponse = { data: { id: 1, originalUrl: 'https://updated.com' } };
      mocks.put.mockResolvedValue(mockResponse);

      const result = await updateURL(1, 'https://updated.com');

      expect(mocks.put).toHaveBeenCalledWith('/urls/1', { originalURL: 'https://updated.com' });
      expect(result).toEqual(mockResponse);
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
});
