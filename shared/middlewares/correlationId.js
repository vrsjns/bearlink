const { generateCorrelationId, runWithContext, updateContext } = require('../utils/context');

const CORRELATION_ID_HEADER = 'x-correlation-id';

/**
 * Express middleware that extracts or generates a correlation ID for request tracing.
 *
 * - Checks for existing X-Correlation-ID header (propagated from upstream services)
 * - Generates a new UUID if no correlation ID is present
 * - Wraps the request in AsyncLocalStorage context for automatic propagation
 * - Adds correlation ID to response headers for downstream tracing
 * - Attaches correlationId to req object for convenience
 *
 * @param {string} serviceName - Name of the service for context tagging
 * @returns {Function} Express middleware function
 */
const createCorrelationIdMiddleware = (serviceName) => {
  return (req, res, next) => {
    const correlationId = req.headers[CORRELATION_ID_HEADER] || generateCorrelationId();

    // Add correlation ID to response headers for downstream tracing
    res.setHeader(CORRELATION_ID_HEADER, correlationId);

    // Attach to request for easy access in route handlers
    req.correlationId = correlationId;

    // Create context with correlation ID and service name
    const context = {
      correlationId,
      serviceName,
    };

    // Run the rest of the request within the context
    runWithContext(context, () => {
      // If user is authenticated, add userId to context later via updateContext
      // This happens after auth middleware runs
      const originalNext = next;
      next = () => {
        if (req.user && req.user.id) {
          updateContext({ userId: req.user.id });
        }
        originalNext();
      };
      next();
    });
  };
};

/**
 * Simplified middleware for backward compatibility.
 * Use createCorrelationIdMiddleware(serviceName) for proper service tagging.
 */
const correlationIdMiddleware = (req, res, next) => {
  const correlationId = req.headers[CORRELATION_ID_HEADER] || generateCorrelationId();

  res.setHeader(CORRELATION_ID_HEADER, correlationId);
  req.correlationId = correlationId;

  const context = { correlationId };

  runWithContext(context, () => next());
};

module.exports = {
  createCorrelationIdMiddleware,
  correlationIdMiddleware,
  CORRELATION_ID_HEADER,
};
