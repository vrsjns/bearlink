/**
 * Create events controller with dependencies
 * @param {Object} deps - Dependencies
 * @param {Object} deps.prisma - Prisma client
 * @returns {Object} Controller methods
 */
const createEventsController = ({ prisma }) => {
  const listEvents = async (req, res) => {
    try {
      const page = Math.max(1, parseInt(req.query.page) || 1);
      const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 50));
      const skip = (page - 1) * limit;

      const andClauses = [];

      // Role-based scoping: regular users only see their own events
      if (req.user.role !== 'ADMIN') {
        andClauses.push({ payload: { path: ['userId'], equals: req.user.id } });
      }

      // Type filter
      if (req.query.type) {
        andClauses.push({ type: req.query.type });
      }

      // Date range filter
      if (req.query.from || req.query.to) {
        const dateFilter = {};
        if (req.query.from) dateFilter.gte = new Date(req.query.from);
        if (req.query.to) dateFilter.lte = new Date(req.query.to);
        andClauses.push({ createdAt: dateFilter });
      }

      // userId filter (admin only)
      if (req.query.userId && req.user.role === 'ADMIN') {
        andClauses.push({ payload: { path: ['userId'], equals: parseInt(req.query.userId) } });
      }

      const where = andClauses.length > 0 ? { AND: andClauses } : {};

      const [events, total] = await Promise.all([
        prisma.event.findMany({ where, skip, take: limit, orderBy: { createdAt: 'desc' } }),
        prisma.event.count({ where }),
      ]);

      res.json({ data: events, pagination: { page, limit, total } });
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch events' });
    }
  };

  return {
    listEvents,
  };
};

module.exports = { createEventsController };
