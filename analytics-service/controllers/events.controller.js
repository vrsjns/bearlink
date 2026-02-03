/**
 * Create events controller with dependencies
 * @param {Object} deps - Dependencies
 * @param {Object} deps.prisma - Prisma client
 * @returns {Object} Controller methods
 */
const createEventsController = ({ prisma }) => {
  const listEvents = async (req, res) => {
    try {
      const events = await prisma.event.findMany();
      res.json(events);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch events' });
    }
  };

  return {
    listEvents,
  };
};

module.exports = { createEventsController };
