/**
 * Queue names for RabbitMQ messaging
 */
const QUEUES = Object.freeze({
  EVENTS: 'events',
  EMAIL_NOTIFICATIONS: 'email_notifications',
  PREVIEW_JOBS: 'preview_jobs',
  PREVIEW_RESULTS: 'preview_results',
});

/**
 * Event types for domain events
 */
const EVENT_TYPES = Object.freeze({
  USER_REGISTERED: 'user_registered',
  URL_CREATED: 'url_created',
  URL_CLICKED: 'url_clicked',
});

module.exports = {
  QUEUES,
  EVENT_TYPES,
};
