import { describe, it, expect } from 'vitest';
import {
  generateCorrelationId,
  getContext,
  runWithContext,
  updateContext,
} from './context';

describe('Context Utils', () => {
  describe('generateCorrelationId', () => {
    it('should generate a valid UUID', () => {
      const id = generateCorrelationId();
      expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    });

    it('should generate unique IDs', () => {
      const id1 = generateCorrelationId();
      const id2 = generateCorrelationId();
      expect(id1).not.toBe(id2);
    });
  });

  describe('getContext', () => {
    it('should return undefined outside of a context', () => {
      expect(getContext()).toBeUndefined();
    });

    it('should return the context when inside runWithContext', () => {
      const testContext = { correlationId: 'test-123', serviceName: 'test-service' };

      runWithContext(testContext, () => {
        expect(getContext()).toEqual(testContext);
      });
    });
  });

  describe('runWithContext', () => {
    it('should run callback with the provided context', () => {
      const context = { correlationId: 'abc-123' };
      let capturedContext;

      runWithContext(context, () => {
        capturedContext = getContext();
      });

      expect(capturedContext).toEqual(context);
    });

    it('should return the callback return value', () => {
      const result = runWithContext({ correlationId: 'test' }, () => {
        return 'test-result';
      });

      expect(result).toBe('test-result');
    });

    it('should handle nested contexts', () => {
      const outerContext = { correlationId: 'outer' };
      const innerContext = { correlationId: 'inner' };

      runWithContext(outerContext, () => {
        expect(getContext().correlationId).toBe('outer');

        runWithContext(innerContext, () => {
          expect(getContext().correlationId).toBe('inner');
        });

        expect(getContext().correlationId).toBe('outer');
      });
    });

    it('should handle async operations', async () => {
      const context = { correlationId: 'async-test' };

      await runWithContext(context, async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        expect(getContext()).toEqual(context);
      });
    });
  });

  describe('updateContext', () => {
    it('should merge updates into existing context', () => {
      const context = { correlationId: 'test-123', serviceName: 'auth' };

      runWithContext(context, () => {
        updateContext({ userId: 42 });
        expect(getContext()).toEqual({
          correlationId: 'test-123',
          serviceName: 'auth',
          userId: 42,
        });
      });
    });

    it('should overwrite existing properties', () => {
      const context = { correlationId: 'test', operation: 'login' };

      runWithContext(context, () => {
        updateContext({ operation: 'logout' });
        expect(getContext().operation).toBe('logout');
      });
    });

    it('should do nothing when called outside a context', () => {
      // Should not throw
      expect(() => updateContext({ userId: 1 })).not.toThrow();
    });
  });
});
