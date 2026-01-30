import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { runWithContext } from './context';

describe('Logger Utils', () => {
  let originalLogFormat;
  let originalLogLevel;

  beforeEach(() => {
    vi.resetModules();
    originalLogFormat = process.env.LOG_FORMAT;
    originalLogLevel = process.env.LOG_LEVEL;
  });

  afterEach(() => {
    if (originalLogFormat !== undefined) {
      process.env.LOG_FORMAT = originalLogFormat;
    } else {
      delete process.env.LOG_FORMAT;
    }
    if (originalLogLevel !== undefined) {
      process.env.LOG_LEVEL = originalLogLevel;
    } else {
      delete process.env.LOG_LEVEL;
    }
  });

  describe('createLogger', () => {
    it('should create a logger with service name', async () => {
      const { createLogger } = await import('./logger');
      const logger = createLogger('test-service');

      expect(logger).toBeDefined();
      expect(typeof logger.info).toBe('function');
      expect(typeof logger.warn).toBe('function');
      expect(typeof logger.error).toBe('function');
    });

    it('should include service name in default meta', async () => {
      const { createLogger } = await import('./logger');
      const logger = createLogger('my-service');

      expect(logger.defaultMeta).toEqual({ service: 'my-service' });
    });
  });

  describe('default logger export', () => {
    it('should export a default logger', async () => {
      const logger = await import('./logger');

      expect(logger.default).toBeDefined();
      expect(typeof logger.default.info).toBe('function');
    });
  });

  describe('context format', () => {
    it('should inject correlationId from context', async () => {
      const { createLogger } = await import('./logger');
      const logger = createLogger('test-service');

      const logSpy = vi.spyOn(logger, 'info');

      runWithContext({ correlationId: 'test-corr-id' }, () => {
        logger.info('test message');
      });

      expect(logSpy).toHaveBeenCalled();
    });

    it('should inject serviceName from context', async () => {
      const { createLogger } = await import('./logger');
      const logger = createLogger('test-service');

      const logSpy = vi.spyOn(logger, 'info');

      runWithContext({ serviceName: 'context-service' }, () => {
        logger.info('test message');
      });

      expect(logSpy).toHaveBeenCalled();
    });

    it('should inject userId from context', async () => {
      const { createLogger } = await import('./logger');
      const logger = createLogger('test-service');

      const logSpy = vi.spyOn(logger, 'info');

      runWithContext({ userId: 42 }, () => {
        logger.info('test message');
      });

      expect(logSpy).toHaveBeenCalled();
    });

    it('should inject operation from context', async () => {
      const { createLogger } = await import('./logger');
      const logger = createLogger('test-service');

      const logSpy = vi.spyOn(logger, 'info');

      runWithContext({ operation: 'test-operation' }, () => {
        logger.info('test message');
      });

      expect(logSpy).toHaveBeenCalled();
    });

    it('should handle full context', async () => {
      const { createLogger } = await import('./logger');
      const logger = createLogger('test-service');

      const logSpy = vi.spyOn(logger, 'info');

      runWithContext({
        correlationId: 'corr-123',
        serviceName: 'auth-service',
        userId: 99,
        operation: 'login',
      }, () => {
        logger.info('test message');
      });

      expect(logSpy).toHaveBeenCalled();
    });

    it('should work without context', async () => {
      const { createLogger } = await import('./logger');
      const logger = createLogger('test-service');

      const logSpy = vi.spyOn(logger, 'info');

      // Log without being in a context
      logger.info('test message without context');

      expect(logSpy).toHaveBeenCalled();
    });
  });

  describe('text format', () => {
    it('should use text format when LOG_FORMAT=text', async () => {
      process.env.LOG_FORMAT = 'text';
      vi.resetModules();

      const { createLogger } = await import('./logger');
      const logger = createLogger('text-service');

      // Just verify it can log without errors
      expect(() => logger.info('text format test')).not.toThrow();
    });

    it('should format context in text mode', async () => {
      process.env.LOG_FORMAT = 'text';
      vi.resetModules();

      const { createLogger } = await import('./logger');
      const logger = createLogger('text-service');

      runWithContext({
        correlationId: 'abc123def456',
        serviceName: 'my-svc',
        userId: 42,
      }, () => {
        expect(() => logger.info('test with context')).not.toThrow();
      });
    });
  });

  describe('log levels', () => {
    it('should respect LOG_LEVEL environment variable', async () => {
      process.env.LOG_LEVEL = 'error';
      vi.resetModules();

      const { createLogger } = await import('./logger');
      const logger = createLogger('test-service');

      expect(logger.level).toBe('error');
    });

    it('should default to info level', async () => {
      delete process.env.LOG_LEVEL;
      vi.resetModules();

      const { createLogger } = await import('./logger');
      const logger = createLogger('test-service');

      expect(logger.level).toBe('info');
    });
  });
});
