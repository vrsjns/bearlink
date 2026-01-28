const { AsyncLocalStorage } = require('async_hooks');
const { v4: uuidv4 } = require('uuid');

/**
 * AsyncLocalStorage instance for request context management.
 * Allows automatic propagation of context (correlationId, serviceName, etc.)
 * across async operations within a request lifecycle.
 */
const asyncLocalStorage = new AsyncLocalStorage();

/**
 * Context shape:
 * @typedef {Object} RequestContext
 * @property {string} correlationId - Unique identifier for request tracing
 * @property {string} [serviceName] - Name of the current service
 * @property {number} [userId] - Authenticated user ID if available
 * @property {string} [operation] - Current operation being performed
 */

/**
 * Generates a new correlation ID (UUID v4)
 * @returns {string} New correlation ID
 */
const generateCorrelationId = () => uuidv4();

/**
 * Gets the current request context from AsyncLocalStorage
 * @returns {RequestContext|undefined} Current context or undefined if not in a context
 */
const getContext = () => asyncLocalStorage.getStore();

/**
 * Runs a function within a new context
 * @param {RequestContext} context - Context to set for the duration of the callback
 * @param {Function} callback - Function to run within the context
 * @returns {*} Return value of the callback
 */
const runWithContext = (context, callback) => {
  return asyncLocalStorage.run(context, callback);
};

/**
 * Updates the current context with new values (merges with existing)
 * @param {Partial<RequestContext>} updates - Values to merge into context
 */
const updateContext = (updates) => {
  const currentContext = getContext();
  if (currentContext) {
    Object.assign(currentContext, updates);
  }
};

module.exports = {
  generateCorrelationId,
  getContext,
  runWithContext,
  updateContext,
};
