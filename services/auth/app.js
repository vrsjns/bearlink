const express = require('express');
const cookieParser = require('cookie-parser');
const { corsMiddleware } = require('shared/middlewares/cors');
const { createCorrelationIdMiddleware } = require('shared/middlewares/correlationId');
const { createRequestLogger } = require('shared/middlewares/requestLogger');
const { createRoutes } = require('./routes');
const { createLoginAttemptStore } = require('./services/loginAttempts');
const { csrfMiddleware } = require('./middlewares/csrf');

/**
 * Create Express app with dependencies
 * @param {Object} deps - Dependencies
 * @param {Object} deps.prisma - Prisma client
 * @param {Object} deps.eventPublisher - Event publisher
 * @returns {express.Application} Express app
 */
const createApp = ({ prisma, eventPublisher, loginAttemptStore = createLoginAttemptStore() }) => {
  const app = express();

  // Middleware setup
  app.use(corsMiddleware);
  app.use(cookieParser());
  app.use(express.json());
  app.use(createCorrelationIdMiddleware('auth-service'));
  app.use(createRequestLogger('auth-service'));
  app.use(csrfMiddleware);

  // Mount routes
  app.use(createRoutes({ prisma, eventPublisher, loginAttemptStore }));

  return app;
};

module.exports = { createApp };
