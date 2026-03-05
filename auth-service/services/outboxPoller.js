const POLL_INTERVAL_MS = 5000;
const BATCH_SIZE = 100;
const REQUEST_TIMEOUT_MS = 10000;

const createOutboxPoller = ({ prisma, auditServiceUrl, logger }) => {
  let intervalId = null;
  let inFlight = null;

  const poll = async () => {
    if (!auditServiceUrl) return;

    const rows = await prisma.outboxEvent.findMany({
      where: { processed: false },
      orderBy: { createdAt: 'asc' },
      take: BATCH_SIZE,
    });

    if (rows.length === 0) return;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const res = await fetch(`${auditServiceUrl}/internal/audit-events`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Audit-Secret': process.env.AUDIT_INTERNAL_SECRET || '',
        },
        body: JSON.stringify(
          rows.map((r) => ({
            eventId: String(r.id),
            eventType: r.eventType,
            payload: r.payload,
            actorId: r.actorId,
            sourceService: 'auth-service',
            createdAt: r.createdAt,
          }))
        ),
        signal: controller.signal,
      });

      if (res.ok) {
        const now = new Date();
        await prisma.outboxEvent.updateMany({
          where: { id: { in: rows.map((r) => r.id) } },
          data: { processed: true, processedAt: now },
        });
        logger.info('Outbox: forwarded events', { count: rows.length });
      } else {
        logger.warn('Outbox: audit-service returned non-2xx', { status: res.status });
      }
    } catch (err) {
      logger.warn('Outbox: failed to reach audit-service, will retry', { error: err.message });
    } finally {
      clearTimeout(timeout);
    }
  };

  const start = () => {
    if (!auditServiceUrl) {
      logger.warn('Outbox poller: AUDIT_SERVICE_URL not set — rows will accumulate until it is');
      return;
    }
    intervalId = setInterval(() => {
      inFlight = poll().catch((err) => logger.error('Outbox poll error', { error: err.message }));
    }, POLL_INTERVAL_MS);
    logger.info('Outbox poller started', { intervalMs: POLL_INTERVAL_MS });
  };

  const stop = async () => {
    if (intervalId) {
      clearInterval(intervalId);
      intervalId = null;
    }
    if (inFlight) {
      await inFlight.catch(() => {});
    }
    logger.info('Outbox poller stopped');
  };

  return { start, stop };
};

module.exports = { createOutboxPoller };
