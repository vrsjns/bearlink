const { createLogger } = require('shared/utils/logger');

const logger = createLogger('analytics-service');

/**
 * Create event handler with dependencies
 * @param {Object} deps - Dependencies
 * @param {Object} deps.prisma - Prisma client
 * @returns {Function} Event handler function
 */
const createEventHandler = ({ prisma }) => {
  return async (type, payload) => {
    try {
      await prisma.event.create({
        data: { type, payload },
      });
      logger.info('Event stored successfully', { eventType: type });
    } catch (error) {
      logger.error('Failed to store event', { eventType: type, error: error.message });
    }
  };
};

module.exports = { createEventHandler };
