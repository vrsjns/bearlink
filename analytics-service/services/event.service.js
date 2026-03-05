const { createLogger } = require('shared/utils/logger');

const logger = createLogger('analytics-service');

const SCHEMAS = {
  user_registered: ['id', 'email'],
  url_created: ['shortId', 'userId'],
  url_updated: ['shortId', 'userId'],
  url_deleted: ['shortId', 'userId'],
  url_clicked: ['shortId'],
  password_reset_requested: ['userId'],
  password_reset_completed: ['userId'],
};

/**
 * Create event handler with dependencies
 * @param {Object} deps - Dependencies
 * @param {Object} deps.prisma - Prisma client
 * @returns {Function} Event handler function
 */
const createEventHandler = ({ prisma }) => {
  return async (type, payload) => {
    try {
      if (!(type in SCHEMAS)) {
        logger.warn('Unknown event type, discarding', { eventType: type });
        return;
      }

      const requiredFields = SCHEMAS[type];
      const missingFields = requiredFields.filter((field) => !(field in payload));
      if (missingFields.length > 0) {
        logger.warn('Event payload missing required fields, discarding', {
          eventType: type,
          missingFields,
        });
        return;
      }

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
