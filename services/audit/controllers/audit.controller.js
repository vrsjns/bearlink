const ingestAuditEvents =
  ({ prisma }) =>
  async (req, res) => {
    const events = req.body;

    if (!Array.isArray(events) || events.length === 0) {
      return res.status(400).json({ error: 'Request body must be a non-empty array' });
    }

    const data = events.map((e) => ({
      eventId: String(e.eventId),
      eventType: e.eventType,
      actorId: e.actorId ?? null,
      sourceService: e.sourceService,
      payload: e.payload,
    }));

    let result;
    try {
      result = await prisma.auditEntry.createMany({ data, skipDuplicates: true });
    } catch (err) {
      return res.status(500).json({ error: 'Internal server error' });
    }

    const received = events.length;
    const inserted = result.count;
    const skipped = received - inserted;

    return res.json({ received, inserted, skipped });
  };

const queryAuditLog =
  ({ prisma }) =>
  async (req, res) => {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 50));
    const skip = (page - 1) * limit;

    const where = {};
    if (req.query.type) where.eventType = req.query.type;
    if (req.query.actorId) where.actorId = req.query.actorId;
    if (req.query.service) where.sourceService = req.query.service;
    if (req.query.from || req.query.to) {
      where.createdAt = {};
      if (req.query.from) where.createdAt.gte = new Date(req.query.from);
      if (req.query.to) where.createdAt.lte = new Date(req.query.to);
    }

    const [data, total] = await Promise.all([
      prisma.auditEntry.findMany({ where, skip, take: limit, orderBy: { createdAt: 'desc' } }),
      prisma.auditEntry.count({ where }),
    ]);

    return res.json({ data, pagination: { page, limit, total } });
  };

module.exports = { ingestAuditEvents, queryAuditLog };
