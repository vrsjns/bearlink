import { describe, it, expect } from 'vitest';

// Import the actual service function
const { generateShortId } = require('../services/url.service');

describe('URL Service', () => {
  describe('generateShortId', () => {
    it('should generate a short ID string', () => {
      const shortId = generateShortId();

      expect(shortId).toBeDefined();
      expect(typeof shortId).toBe('string');
      expect(shortId.length).toBeGreaterThan(0);
    });

    it('should generate IDs of default length (10)', () => {
      const shortId = generateShortId();

      expect(shortId.length).toBe(10);
    });

    it('should generate unique IDs on each call', () => {
      const id1 = generateShortId();
      const id2 = generateShortId();

      expect(id1).not.toBe(id2);
    });

    it('should accept custom length parameter', () => {
      const shortId = generateShortId(8);

      expect(shortId.length).toBe(8);
    });

    it('should generate URL-safe characters only', () => {
      const shortId = generateShortId();

      // nanoid uses URL-safe alphabet by default
      expect(shortId).toMatch(/^[A-Za-z0-9_-]+$/);
    });
  });
});
