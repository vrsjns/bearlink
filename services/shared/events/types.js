/**
 * @typedef {Object} UserRegisteredPayload
 * @property {number} id - User ID
 * @property {string} email - User email address
 * @property {string} name - User display name
 * @property {string} role - User role (e.g., 'user', 'admin')
 * @property {string} createdAt - ISO timestamp of user creation
 */

/**
 * @typedef {Object} UrlCreatedPayload
 * @property {number} id - URL record ID
 * @property {string} originalUrl - The original long URL
 * @property {string} shortId - The generated short ID
 * @property {number} clicks - Number of clicks (initially 0)
 * @property {string} createdAt - ISO timestamp of URL creation
 * @property {number} userId - ID of the user who created the URL
 */

/**
 * @typedef {Object} UrlClickedPayload
 * @property {string} shortId - The short ID that was clicked
 * @property {string} originalUrl - The original URL being redirected to
 */

/**
 * @typedef {Object} EmailNotificationPayload
 * @property {string} to - Recipient email address
 * @property {string} subject - Email subject line
 * @property {string} text - Email body text
 */

/**
 * @typedef {Object} EventMessage
 * @property {string} type - The event type
 * @property {Object} payload - The event payload
 */

module.exports = {};
