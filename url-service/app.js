const express = require('express');
const cookieParser = require('cookie-parser');
const { corsMiddleware } = require('shared/middlewares/cors');
const { createCorrelationIdMiddleware } = require('shared/middlewares/correlationId');
const { createRequestLogger } = require('shared/middlewares/requestLogger');
const { createRoutes } = require('./routes');

/**
 * Create Express app with dependencies
 * @param {Object} deps - Dependencies
 * @param {Object} deps.prisma - Prisma client
 * @param {Object} deps.eventPublisher - Event publisher
 * @param {string} deps.baseUrl - Base URL for short links
 * @returns {express.Application} Express app
 */
const createApp = ({ prisma, eventPublisher, baseUrl, publishPreviewJob, redis }) => {
  const app = express();

  // Middleware setup
  app.use(corsMiddleware);
  app.use(cookieParser());
  app.use(express.json());
  app.use(createCorrelationIdMiddleware('url-service'));
  app.use(createRequestLogger('url-service'));

  // Mount routes
  app.use(createRoutes({ prisma, eventPublisher, baseUrl, publishPreviewJob, redis }));

  return app;
};

module.exports = { createApp };
