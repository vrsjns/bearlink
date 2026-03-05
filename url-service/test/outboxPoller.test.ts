import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createOutboxPoller } from '../services/outboxPoller';

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
    eventType: 'url_created',
    payload: { shortId: 'abc123', userId: 1, originalUrl: 'https://example.com' },
    actorId: '1',
    createdAt: new Date('2024-01-01T00:00:00Z'),
  },
  {
    id: 2,
    eventType: 'url_clicked',
    payload: { shortId: 'abc123', ip: 'hashed', userAgent: 'Mozilla', country: 'US' },
    actorId: null,
    createdAt: new Date('2024-01-01T00:01:00Z'),
  },
];

describe('createOutboxPoller (url-service)', () => {
  let capturedCallback: (() => void) | null;

  beforeEach(() => {
    vi.clearAllMocks();
    capturedCallback = null;

    vi.spyOn(global, 'setInterval').mockImplementation((fn: any) => {
      capturedCallback = fn;
      return 999 as any;
    });
    vi.spyOn(global, 'clearInterval').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  describe('forwarding rows to audit-service', () => {
    it('should POST unprocessed rows and mark them processed on 2xx', async () => {
      const mockFetch = vi.fn().mockResolvedValue({ ok: true, status: 200 });
      vi.stubGlobal('fetch', mockFetch);

      mockFindMany.mockResolvedValue(sampleRows);
      mockUpdateMany.mockResolvedValue({ count: 2 });

      const poller = createOutboxPoller({
        prisma: mockPrisma,
        auditServiceUrl: 'http://audit-service:9000',
        logger: mockLogger,
      });

      poller.start();
      capturedCallback!();
      await poller.stop();

      expect(mockFetch).toHaveBeenCalledWith(
        'http://audit-service:9000/internal/audit-events',
        expect.objectContaining({ method: 'POST' })
      );

      const fetchBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(fetchBody).toHaveLength(2);
      expect(fetchBody[0]).toMatchObject({
        eventId: '1',
        eventType: 'url_created',
        sourceService: 'url-service',
      });

      expect(mockUpdateMany).toHaveBeenCalledWith({
        where: { id: { in: [1, 2] } },
        data: expect.objectContaining({ processed: true }),
      });

      expect(mockLogger.info).toHaveBeenCalledWith('Outbox: forwarded events', { count: 2 });
    });

    it('should do nothing when there are no unprocessed rows', async () => {
      const mockFetch = vi.fn();
      vi.stubGlobal('fetch', mockFetch);

      mockFindMany.mockResolvedValue([]);

      const poller = createOutboxPoller({
        prisma: mockPrisma,
        auditServiceUrl: 'http://audit-service:9000',
        logger: mockLogger,
      });

      poller.start();
      capturedCallback!();
      await poller.stop();

      expect(mockFetch).not.toHaveBeenCalled();
      expect(mockUpdateMany).not.toHaveBeenCalled();
    });
  });

  describe('unreachable audit-service', () => {
    it('should leave rows unprocessed when fetch throws a network error', async () => {
      const mockFetch = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));
      vi.stubGlobal('fetch', mockFetch);

      mockFindMany.mockResolvedValue(sampleRows);

      const poller = createOutboxPoller({
        prisma: mockPrisma,
        auditServiceUrl: 'http://audit-service:9000',
        logger: mockLogger,
      });

      poller.start();
      capturedCallback!();
      await poller.stop();

      expect(mockUpdateMany).not.toHaveBeenCalled();
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Outbox: failed to reach audit-service, will retry',
        expect.objectContaining({ error: 'ECONNREFUSED' })
      );
    });

    it('should leave rows unprocessed when audit-service returns non-2xx', async () => {
      const mockFetch = vi.fn().mockResolvedValue({ ok: false, status: 503 });
      vi.stubGlobal('fetch', mockFetch);

      mockFindMany.mockResolvedValue(sampleRows);

      const poller = createOutboxPoller({
        prisma: mockPrisma,
        auditServiceUrl: 'http://audit-service:9000',
        logger: mockLogger,
      });

      poller.start();
      capturedCallback!();
      await poller.stop();

      expect(mockUpdateMany).not.toHaveBeenCalled();
      expect(mockLogger.warn).toHaveBeenCalledWith('Outbox: audit-service returned non-2xx', {
        status: 503,
      });
    });
  });

  describe('missing AUDIT_SERVICE_URL', () => {
    it('should skip starting the interval and log a warning on boot', () => {
      const poller = createOutboxPoller({
        prisma: mockPrisma,
        auditServiceUrl: undefined,
        logger: mockLogger,
      });

      poller.start();

      expect(global.setInterval).not.toHaveBeenCalled();
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Outbox poller: AUDIT_SERVICE_URL not set — rows will accumulate until it is'
      );
    });

    it('should not call findMany or fetch when AUDIT_SERVICE_URL is missing', async () => {
      const mockFetch = vi.fn();
      vi.stubGlobal('fetch', mockFetch);

      const poller = createOutboxPoller({
        prisma: mockPrisma,
        auditServiceUrl: undefined,
        logger: mockLogger,
      });

      poller.start();
      await poller.stop();

      expect(mockFindMany).not.toHaveBeenCalled();
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });
});
