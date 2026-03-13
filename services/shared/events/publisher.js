const { QUEUES, EVENT_TYPES } = require('./constants');
const { getContext } = require('../utils/context');

/**
 * Creates an event publisher with typed methods for publishing events
 * @param {Object} channel - RabbitMQ channel
 * @returns {Object} Event publisher with typed methods
 */
const createEventPublisher = (channel) => {
  /**
   * Gets message options including correlation headers from context
   * @returns {Object} AMQP message options
   */
  const getMessageOptions = () => {
    const context = getContext();
    const headers = {};

    if (context) {
      if (context.correlationId) {
        headers['x-correlation-id'] = context.correlationId;
      }
      if (context.serviceName) {
        headers['x-source-service'] = context.serviceName;
      }
    }

    return Object.keys(headers).length > 0 ? { headers } : undefined;
  };

  /**
   * Publishes an event to the events queue
   * @param {string} type - Event type
   * @param {Object} payload - Event payload
   */
  const publishEvent = (type, payload) => {
    channel.sendToQueue(
      QUEUES.EVENTS,
      Buffer.from(JSON.stringify({ type, payload })),
      getMessageOptions()
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
   * Publishes a url_updated event
   * @param {import('./types').UrlUpdatedPayload} payload
   */
  const publishUrlUpdated = (payload) => {
    publishEvent(EVENT_TYPES.URL_UPDATED, payload);
  };

  /**
   * Publishes a url_deleted event
   * @param {import('./types').UrlDeletedPayload} payload
   */
  const publishUrlDeleted = (payload) => {
    publishEvent(EVENT_TYPES.URL_DELETED, payload);
  };

  /**
   * Publishes a url_clicked event
   * @param {import('./types').UrlClickedPayload} payload
   */
  const publishUrlClicked = (payload) => {
    publishEvent(EVENT_TYPES.URL_CLICKED, payload);
  };

  /**
   * Publishes a password_reset_requested event
   * @param {{ userId: number }} payload
   */
  const publishPasswordResetRequested = (payload) => {
    publishEvent(EVENT_TYPES.PASSWORD_RESET_REQUESTED, payload);
  };

  /**
   * Publishes a password_reset_completed event
   * @param {{ userId: number }} payload
   */
  const publishPasswordResetCompleted = (payload) => {
    publishEvent(EVENT_TYPES.PASSWORD_RESET_COMPLETED, payload);
  };

  /**
   * Publishes an email notification
   * @param {import('./types').EmailNotificationPayload} payload
   */
  const publishEmailNotification = (payload) => {
    channel.sendToQueue(
      QUEUES.EMAIL_NOTIFICATIONS,
      Buffer.from(JSON.stringify(payload)),
      getMessageOptions()
    );
  };

  return {
    publishEvent,
    publishUserRegistered,
    publishUrlCreated,
    publishUrlUpdated,
    publishUrlDeleted,
    publishUrlClicked,
    publishPasswordResetRequested,
    publishPasswordResetCompleted,
    publishEmailNotification,
  };
};

module.exports = {
  createEventPublisher,
};
