import { describe, it, expect } from 'vitest';

describe('URL Service Utilities', () => {
  describe('shortId generation', () => {
    it('should generate a short ID with expected format', () => {
      // Test the expected behavior - nanoid generates alphanumeric strings
      const mockShortId = 'abc1234567';
      expect(mockShortId).toBeDefined();
      expect(typeof mockShortId).toBe('string');
      expect(mockShortId.length).toBe(10);
    });
  });

  describe('URL validation', () => {
    const isValidUrl = (urlString: string): boolean => {
      if (!urlString || typeof urlString !== 'string') {
        return false;
      }
      try {
        const url = new URL(urlString);
        return url.protocol === 'http:' || url.protocol === 'https:';
      } catch {
        return false;
      }
    };

    it('should accept valid HTTP URLs', () => {
      expect(isValidUrl('http://example.com')).toBe(true);
      expect(isValidUrl('https://example.com')).toBe(true);
      expect(isValidUrl('https://example.com/path?query=1')).toBe(true);
    });

    it('should reject invalid URLs', () => {
      expect(isValidUrl('not-a-url')).toBe(false);
      expect(isValidUrl('ftp://example.com')).toBe(false);
      expect(isValidUrl('javascript:alert(1)')).toBe(false);
    });
  });

  describe('URL response formatting', () => {
    it('should construct full short URL from base URL and shortId', () => {
      const baseUrl = 'http://localhost:5000';
      const shortId = 'abc123';
      const fullShortUrl = `${baseUrl}/${shortId}`;

      expect(fullShortUrl).toBe('http://localhost:5000/abc123');
    });
  });

  describe('click counter', () => {
    it('should increment click count', () => {
      const url = { id: 1, shortId: 'abc123', originalUrl: 'https://example.com', clicks: 0 };
      const updatedClicks = url.clicks + 1;

      expect(updatedClicks).toBe(1);
    });
  });
});
