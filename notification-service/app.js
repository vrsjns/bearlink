const express = require('express');
const { corsMiddleware } = require('shared/middlewares/cors');
const { createCorrelationIdMiddleware } = require('shared/middlewares/correlationId');
const { createRequestLogger } = require('shared/middlewares/requestLogger');

/**
 * Create Express app
 * Note: This service has no API routes, only health endpoints added in index.js
 * @returns {express.Application} Express app
 */
const createApp = () => {
  const app = express();

  // Middleware setup
  app.use(corsMiddleware);
  app.use(express.json());
  app.use(createCorrelationIdMiddleware('notification-service'));
  app.use(createRequestLogger('notification-service'));

  return app;
};

module.exports = { createApp };
