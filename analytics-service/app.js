const express = require('express');
const { corsMiddleware } = require('shared/middlewares/cors');
const { createCorrelationIdMiddleware } = require('shared/middlewares/correlationId');
const { createRequestLogger } = require('shared/middlewares/requestLogger');
const { createRoutes } = require('./routes');

/**
 * Create Express app with dependencies
 * @param {Object} deps - Dependencies
 * @param {Object} deps.prisma - Prisma client
 * @returns {express.Application} Express app
 */
const createApp = ({ prisma }) => {
  const app = express();

  // Middleware setup
  app.use(corsMiddleware);
  app.use(express.json());
  app.use(createCorrelationIdMiddleware('analytics-service'));
  app.use(createRequestLogger('analytics-service'));

  // Mount routes
  app.use(createRoutes({ prisma }));

  return app;
};

module.exports = { createApp };
