const { createLogger: winstonCreateLogger, format, transports } = require('winston');
const { getContext } = require('./context');

/**
 * Determines the log format based on LOG_FORMAT environment variable.
 * - 'text': Human-readable format for development
 * - 'json' (default): Structured JSON format for production/log aggregation
 */
const isTextFormat = process.env.LOG_FORMAT === 'text';

/**
 * Custom format that injects context from AsyncLocalStorage
 */
const contextFormat = format((info) => {
  const context = getContext();
  if (context) {
    if (context.correlationId) info.correlationId = context.correlationId;
    if (context.serviceName) info.service = context.serviceName;
    if (context.userId) info.userId = context.userId;
    if (context.operation) info.operation = context.operation;
  }
  return info;
});

/**
 * JSON format for structured logging (production)
 */
const jsonFormat = format.combine(
  format.timestamp(),
  contextFormat(),
  format.errors({ stack: true }),
  format.json()
);

/**
 * Text format for human-readable output (development)
 */
const textFormat = format.combine(
  format.timestamp(),
  contextFormat(),
  format.errors({ stack: true }),
  format.printf(({ timestamp, level, message, correlationId, service, userId, ...meta }) => {
    const contextParts = [];
    if (correlationId) contextParts.push(`cid=${correlationId.substring(0, 8)}`);
    if (service) contextParts.push(`svc=${service}`);
    if (userId) contextParts.push(`uid=${userId}`);
    const contextStr = contextParts.length > 0 ? ` [${contextParts.join(' ')}]` : '';
    const metaStr = Object.keys(meta).length > 0 ? ` ${JSON.stringify(meta)}` : '';
    return `${timestamp} [${level.toUpperCase()}]${contextStr}: ${message}${metaStr}`;
  })
);

/**
 * Creates a logger instance for a specific service
 * @param {string} serviceName - Name of the service using this logger
 * @returns {import('winston').Logger} Configured Winston logger
 */
const createLogger = (serviceName) => {
  const logger = winstonCreateLogger({
    level: process.env.LOG_LEVEL || 'info',
    defaultMeta: { service: serviceName },
    format: isTextFormat ? textFormat : jsonFormat,
    transports: [
      new transports.Console(),
      new transports.File({ filename: 'app.log' })
    ]
  });

  return logger;
};

/**
 * Default logger instance for backward compatibility.
 * Services should prefer using createLogger('service-name') for proper service tagging.
 */
const logger = winstonCreateLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: isTextFormat ? textFormat : jsonFormat,
  transports: [
    new transports.Console(),
    new transports.File({ filename: 'app.log' })
  ]
});

module.exports = logger;
module.exports.createLogger = createLogger;
