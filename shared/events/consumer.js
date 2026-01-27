const { QUEUES } = require('./constants');
const logger = require('../utils/logger');

/**
 * Consumes events from the events queue
 * @param {Object} channel - RabbitMQ channel
 * @param {Function} handler - Async function to handle events, receives (type, payload)
 * @param {Object} [options] - Consumer options
 * @param {number} [options.retryInterval=5000] - Retry interval in ms on error
 * @returns {Promise<void>}
 */
const consumeEvents = async (channel, handler, options = {}) => {
  const { retryInterval = 5000 } = options;

  try {
    await channel.assertQueue(QUEUES.EVENTS);
    channel.consume(QUEUES.EVENTS, async (msg) => {
      if (!msg) return;

      try {
        const event = JSON.parse(msg.content.toString());
        await handler(event.type, event.payload);
        channel.ack(msg);
      } catch (error) {
        logger.error('Failed to handle event:', error);
        channel.nack(msg);
      }
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
 * @returns {Promise<void>}
 */
const consumeEmailNotifications = async (channel, handler, options = {}) => {
  const { retryInterval = 5000 } = options;

  try {
    await channel.assertQueue(QUEUES.EMAIL_NOTIFICATIONS);
    channel.consume(QUEUES.EMAIL_NOTIFICATIONS, async (msg) => {
      if (!msg) return;

      try {
        const emailContent = JSON.parse(msg.content.toString());
        await handler(emailContent);
        channel.ack(msg);
      } catch (error) {
        logger.error('Failed to send email:', { error: error.message });
        channel.nack(msg);
      }
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
