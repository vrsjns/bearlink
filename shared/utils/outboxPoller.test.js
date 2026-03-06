import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createOutboxPoller } from './outboxPoller.js';

const mockFindMany = vi.fn();
const mockUpdateMany = vi.fn();

const mockPrisma = {
  outboxEvent: {
    findMany: mockFindMany,
    updateMany: mockUpdateMany,
  },
};

const mockLogger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
};

const sampleRows = [
  {
    id: 1,
    eventType: 'user_registered',
    payload: { userId: 42, email: 'a@b.com', createdAt: '2024-01-01T00:00:00Z' },
    actorId: '42',
    createdAt: new Date('2024-01-01T00:00:00Z'),
  },
  {
    id: 2,
    eventType: 'url_created',
    payload: { shortId: 'abc123', userId: 1, originalUrl: 'https://example.com' },
    actorId: '1',
    createdAt: new Date('2024-01-01T00:01:00Z'),
  },
];

describe('createOutboxPoller', () => {
  let capturedCallback;

  beforeEach(() => {
    vi.clearAllMocks();
    capturedCallback = null;

    vi.spyOn(global, 'setInterval').mockImplementation((fn) => {
      capturedCallback = fn;
      return 999;
    });
    vi.spyOn(global, 'clearInterval').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  describe('forwarding rows to audit-service', () => {
    it('should POST unprocessed rows ordered by createdAt asc with a batch of up to 100', async () => {
      const mockFetch = vi.fn().mockResolvedValue({ ok: true, status: 200 });
      vi.stubGlobal('fetch', mockFetch);
      mockFindMany.mockResolvedValue(sampleRows);
      mockUpdateMany.mockResolvedValue({ count: 2 });

      const poller = createOutboxPoller({
        prisma: mockPrisma,
        auditServiceUrl: 'http://audit-service:9000',
        logger: mockLogger,
        sourceService: 'auth-service',
      });

      poller.start();
      capturedCallback();
      await poller.stop();

      expect(mockFindMany).toHaveBeenCalledWith({
        where: { processed: false },
        orderBy: { createdAt: 'asc' },
        take: 100,
      });
      expect(mockFetch).toHaveBeenCalledWith(
        'http://audit-service:9000/internal/audit-events',
        expect.objectContaining({ method: 'POST' })
      );
    });

    it('should mark rows processed = true and set processedAt on 2xx response', async () => {
      const mockFetch = vi.fn().mockResolvedValue({ ok: true, status: 200 });
      vi.stubGlobal('fetch', mockFetch);
      mockFindMany.mockResolvedValue(sampleRows);
      mockUpdateMany.mockResolvedValue({ count: 2 });

      const poller = createOutboxPoller({
        prisma: mockPrisma,
        auditServiceUrl: 'http://audit-service:9000',
        logger: mockLogger,
        sourceService: 'auth-service',
      });

      poller.start();
      capturedCallback();
      await poller.stop();

      expect(mockUpdateMany).toHaveBeenCalledWith({
        where: { id: { in: [1, 2] } },
        data: expect.objectContaining({ processed: true, processedAt: expect.any(Date) }),
      });
      expect(mockLogger.info).toHaveBeenCalledWith('Outbox: forwarded events', { count: 2 });
    });

    it('should leave rows unprocessed when audit-service returns non-2xx', async () => {
      const mockFetch = vi.fn().mockResolvedValue({ ok: false, status: 503 });
      vi.stubGlobal('fetch', mockFetch);
      mockFindMany.mockResolvedValue(sampleRows);

      const poller = createOutboxPoller({
        prisma: mockPrisma,
        auditServiceUrl: 'http://audit-service:9000',
        logger: mockLogger,
        sourceService: 'auth-service',
      });

      poller.start();
      capturedCallback();
      await poller.stop();

      expect(mockUpdateMany).not.toHaveBeenCalled();
      expect(mockLogger.warn).toHaveBeenCalledWith('Outbox: audit-service returned non-2xx', {
        status: 503,
      });
    });

    it('should leave rows unprocessed when fetch throws (network error / timeout)', async () => {
      const mockFetch = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));
      vi.stubGlobal('fetch', mockFetch);
      mockFindMany.mockResolvedValue(sampleRows);

      const poller = createOutboxPoller({
        prisma: mockPrisma,
        auditServiceUrl: 'http://audit-service:9000',
        logger: mockLogger,
        sourceService: 'auth-service',
      });

      poller.start();
      capturedCallback();
      await poller.stop();

      expect(mockUpdateMany).not.toHaveBeenCalled();
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Outbox: failed to reach audit-service, will retry',
        expect.objectContaining({ error: 'ECONNREFUSED' })
      );
    });

    it('should do nothing when there are no unprocessed rows', async () => {
      const mockFetch = vi.fn();
      vi.stubGlobal('fetch', mockFetch);
      mockFindMany.mockResolvedValue([]);

      const poller = createOutboxPoller({
        prisma: mockPrisma,
        auditServiceUrl: 'http://audit-service:9000',
        logger: mockLogger,
        sourceService: 'auth-service',
      });

      poller.start();
      capturedCallback();
      await poller.stop();

      expect(mockFetch).not.toHaveBeenCalled();
      expect(mockUpdateMany).not.toHaveBeenCalled();
    });
  });

  describe('sourceService forwarding', () => {
    it('should set sourceService: auth-service on every item in the POST body', async () => {
      const mockFetch = vi.fn().mockResolvedValue({ ok: true, status: 200 });
      vi.stubGlobal('fetch', mockFetch);
      mockFindMany.mockResolvedValue(sampleRows);
      mockUpdateMany.mockResolvedValue({ count: 2 });

      const poller = createOutboxPoller({
        prisma: mockPrisma,
        auditServiceUrl: 'http://audit-service:9000',
        logger: mockLogger,
        sourceService: 'auth-service',
      });

      poller.start();
      capturedCallback();
      await poller.stop();

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.every((item) => item.sourceService === 'auth-service')).toBe(true);
    });

    it('should set sourceService: url-service on every item in the POST body', async () => {
      const mockFetch = vi.fn().mockResolvedValue({ ok: true, status: 200 });
      vi.stubGlobal('fetch', mockFetch);
      mockFindMany.mockResolvedValue(sampleRows);
      mockUpdateMany.mockResolvedValue({ count: 2 });

      const poller = createOutboxPoller({
        prisma: mockPrisma,
        auditServiceUrl: 'http://audit-service:9000',
        logger: mockLogger,
        sourceService: 'url-service',
      });

      poller.start();
      capturedCallback();
      await poller.stop();

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.every((item) => item.sourceService === 'url-service')).toBe(true);
    });
  });

  describe('missing AUDIT_SERVICE_URL', () => {
    it('should skip starting the interval and log a warning on boot', () => {
      const poller = createOutboxPoller({
        prisma: mockPrisma,
        auditServiceUrl: undefined,
        logger: mockLogger,
        sourceService: 'auth-service',
      });

      poller.start();

      expect(global.setInterval).not.toHaveBeenCalled();
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Outbox poller: AUDIT_SERVICE_URL not set — rows will accumulate until it is'
      );
    });

    it('should not call findMany or fetch when auditServiceUrl is falsy', async () => {
      const mockFetch = vi.fn();
      vi.stubGlobal('fetch', mockFetch);

      const poller = createOutboxPoller({
        prisma: mockPrisma,
        auditServiceUrl: undefined,
        logger: mockLogger,
        sourceService: 'auth-service',
      });

      poller.start();
      await poller.stop();

      expect(mockFindMany).not.toHaveBeenCalled();
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  describe('clean shutdown', () => {
    it('should clear the interval and await in-flight poll on stop()', async () => {
      let resolvePoll;
      const pollPromise = new Promise((resolve) => {
        resolvePoll = resolve;
      });
      const mockFetch = vi.fn().mockReturnValue(pollPromise);
      vi.stubGlobal('fetch', mockFetch);
      mockFindMany.mockResolvedValue(sampleRows);
      mockUpdateMany.mockResolvedValue({ count: 2 });

      const poller = createOutboxPoller({
        prisma: mockPrisma,
        auditServiceUrl: 'http://audit-service:9000',
        logger: mockLogger,
        sourceService: 'auth-service',
      });

      poller.start();
      capturedCallback();

      const stopPromise = poller.stop();
      resolvePoll({ ok: true, status: 200 });
      await stopPromise;

      expect(global.clearInterval).toHaveBeenCalledWith(999);
      expect(mockLogger.info).toHaveBeenCalledWith('Outbox poller stopped');
    });
  });
});
