const { createLogger } = require('../utils/logger');

/**
 * Creates a request logging middleware that outputs structured JSON logs.
 * Replaces Morgan with context-aware logging that includes correlation ID and other context.
 *
 * Logs include:
 * - HTTP method and path
 * - Response status code
 * - Request duration in milliseconds
 * - Correlation ID (from AsyncLocalStorage context)
 * - User ID (if authenticated)
 * - Content length (if available)
 *
 * @param {string} serviceName - Name of the service for logger tagging
 * @returns {Function} Express middleware function
 */
const createRequestLogger = (serviceName) => {
  const logger = createLogger(serviceName);

  return (req, res, next) => {
    const startTime = Date.now();

    // Capture original end function
    const originalEnd = res.end;

    // Override end to log after response is complete
    res.end = function(chunk, encoding) {
      // Restore original end
      res.end = originalEnd;

      // Call original end
      res.end(chunk, encoding);

      const duration = Date.now() - startTime;
      const statusCode = res.statusCode;

      // Build log data
      const logData = {
        method: req.method,
        path: req.originalUrl || req.url,
        statusCode,
        duration,
        contentLength: res.get('content-length'),
        userAgent: req.get('user-agent'),
      };

      // Add user ID if available
      if (req.user && req.user.id) {
        logData.userId = req.user.id;
      }

      // Add correlation ID for reference (though it's also in context)
      if (req.correlationId) {
        logData.correlationId = req.correlationId;
      }

      // Determine log level based on status code
      const level = statusCode >= 500 ? 'error' : statusCode >= 400 ? 'warn' : 'info';

      logger[level](`${req.method} ${req.originalUrl || req.url} ${statusCode} ${duration}ms`, logData);
    };

    next();
  };
};

module.exports = {
  createRequestLogger,
};
