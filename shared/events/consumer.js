const { QUEUES } = require('./constants');
const logger = require('../utils/logger');
const { runWithContext, generateCorrelationId } = require('../utils/context');

/**
 * Extracts correlation context from RabbitMQ message headers
 * @param {Object} msg - RabbitMQ message
 * @returns {Object} Context object with correlationId and sourceService
 */
const extractContextFromMessage = (msg) => {
  const headers = msg.properties?.headers || {};
  return {
    correlationId: headers['x-correlation-id'] || generateCorrelationId(),
    sourceService: headers['x-source-service'],
  };
};

/**
 * Consumes events from the events queue
 * @param {Object} channel - RabbitMQ channel
 * @param {Function} handler - Async function to handle events, receives (type, payload)
 * @param {Object} [options] - Consumer options
 * @param {number} [options.retryInterval=5000] - Retry interval in ms on error
 * @param {string} [options.serviceName] - Name of the consuming service for context
 * @returns {Promise<void>}
 */
const consumeEvents = async (channel, handler, options = {}) => {
  const { retryInterval = 5000, serviceName } = options;

  try {
    await channel.assertQueue(QUEUES.EVENTS);
    channel.consume(QUEUES.EVENTS, async (msg) => {
      if (!msg) return;

      const { correlationId, sourceService } = extractContextFromMessage(msg);
      const context = {
        correlationId,
        serviceName: serviceName || 'consumer',
        sourceService,
      };

      // Wrap handler execution in context for automatic log correlation
      runWithContext(context, async () => {
        try {
          const event = JSON.parse(msg.content.toString());
          await handler(event.type, event.payload);
          channel.ack(msg);
        } catch (error) {
          logger.error('Failed to handle event:', error);
          channel.nack(msg);
        }
      });
    });
  } catch (error) {
    logger.error('Failed to consume events:', error.message);
    setTimeout(() => consumeEvents(channel, handler, options), retryInterval);
  }
};

/**
 * Consumes email notifications from the email_notifications queue
 * @param {Object} channel - RabbitMQ channel
 * @param {Function} handler - Async function to handle email, receives ({ to, subject, text })
 * @param {Object} [options] - Consumer options
 * @param {number} [options.retryInterval=5000] - Retry interval in ms on error
 * @param {string} [options.serviceName] - Name of the consuming service for context
 * @returns {Promise<void>}
 */
const consumeEmailNotifications = async (channel, handler, options = {}) => {
  const { retryInterval = 5000, serviceName } = options;

  try {
    await channel.assertQueue(QUEUES.EMAIL_NOTIFICATIONS);
    channel.consume(QUEUES.EMAIL_NOTIFICATIONS, async (msg) => {
      if (!msg) return;

      const { correlationId, sourceService } = extractContextFromMessage(msg);
      const context = {
        correlationId,
        serviceName: serviceName || 'consumer',
        sourceService,
      };

      // Wrap handler execution in context for automatic log correlation
      runWithContext(context, async () => {
        try {
          const emailContent = JSON.parse(msg.content.toString());
          await handler(emailContent);
          channel.ack(msg);
        } catch (error) {
          logger.error('Failed to send email:', { error: error.message });
          channel.nack(msg);
        }
      });
    });
  } catch (error) {
    logger.error('Failed to consume email_notifications:', error.message);
    setTimeout(() => consumeEmailNotifications(channel, handler, options), retryInterval);
  }
};

module.exports = {
  consumeEvents,
  consumeEmailNotifications,
};
