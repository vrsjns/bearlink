/**
 * Create analytics controller with dependencies
 * @param {Object} deps - Dependencies
 * @param {Object} deps.prisma - Prisma client
 * @returns {Object} Controller methods
 */
const createAnalyticsController = ({ prisma }) => {
  const getUrlClicks = async (req, res) => {
    try {
      const { shortId } = req.params;
      const where = { type: 'url_clicked', payload: { path: ['shortId'], equals: shortId } };
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);

      const [total, today] = await Promise.all([
        prisma.event.count({ where }),
        prisma.event.count({ where: { ...where, createdAt: { gte: todayStart } } }),
      ]);

      res.json({ total, today });
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch click counts' });
    }
  };

  const getSummary = async (req, res) => {
    try {
      const [totalUsers, totalUrls, totalClicks] = await Promise.all([
        prisma.event.count({ where: { type: 'user_registered' } }),
        prisma.event.count({ where: { type: 'url_created' } }),
        prisma.event.count({ where: { type: 'url_clicked' } }),
      ]);
      res.json({ totalUsers, totalUrls, totalClicks });
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch summary' });
    }
  };

  const getTopUrls = async (req, res) => {
    try {
      const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 10));
      let fromDate = new Date(0);
      if (req.query.period) {
        const match = req.query.period.match(/^(\d+)d$/);
        if (match) {
          const days = parseInt(match[1]);
          fromDate = new Date(Date.now() - days * 86400_000);
        }
      }

      const results = await prisma.$queryRaw`
        SELECT payload->>'shortId' AS "shortId", COUNT(*)::int AS clicks
        FROM "Event"
        WHERE type = 'url_clicked' AND "createdAt" >= ${fromDate}
        GROUP BY payload->>'shortId'
        ORDER BY clicks DESC
        LIMIT ${limit}
      `;

      res.json(results);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch top URLs' });
    }
  };

  return { getUrlClicks, getSummary, getTopUrls };
};

module.exports = { createAnalyticsController };
