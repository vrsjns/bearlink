const { QUEUES, EVENT_TYPES } = require('./constants');

/**
 * Creates an event publisher with typed methods for publishing events
 * @param {Object} channel - RabbitMQ channel
 * @returns {Object} Event publisher with typed methods
 */
const createEventPublisher = (channel) => {
  /**
   * Publishes an event to the events queue
   * @param {string} type - Event type
   * @param {Object} payload - Event payload
   */
  const publishEvent = (type, payload) => {
    channel.sendToQueue(
      QUEUES.EVENTS,
      Buffer.from(JSON.stringify({ type, payload }))
    );
  };

  /**
   * Publishes a user_registered event
   * @param {import('./types').UserRegisteredPayload} payload
   */
  const publishUserRegistered = (payload) => {
    publishEvent(EVENT_TYPES.USER_REGISTERED, payload);
  };

  /**
   * Publishes a url_created event
   * @param {import('./types').UrlCreatedPayload} payload
   */
  const publishUrlCreated = (payload) => {
    publishEvent(EVENT_TYPES.URL_CREATED, payload);
  };

  /**
   * Publishes a url_clicked event
   * @param {import('./types').UrlClickedPayload} payload
   */
  const publishUrlClicked = (payload) => {
    publishEvent(EVENT_TYPES.URL_CLICKED, payload);
  };

  /**
   * Publishes an email notification
   * @param {import('./types').EmailNotificationPayload} payload
   */
  const publishEmailNotification = (payload) => {
    channel.sendToQueue(
      QUEUES.EMAIL_NOTIFICATIONS,
      Buffer.from(JSON.stringify(payload))
    );
  };

  return {
    publishEvent,
    publishUserRegistered,
    publishUrlCreated,
    publishUrlClicked,
    publishEmailNotification,
  };
};

module.exports = {
  createEventPublisher,
};
