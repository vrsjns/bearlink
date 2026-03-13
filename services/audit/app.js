const express = require('express');
const cookieParser = require('cookie-parser');
const { corsMiddleware } = require('shared/middlewares/cors');
const { createCorrelationIdMiddleware } = require('shared/middlewares/correlationId');
const { createRequestLogger } = require('shared/middlewares/requestLogger');
const { createRoutes } = require('./routes');

const createApp = ({ prisma }) => {
  const app = express();

  app.use(corsMiddleware);
  app.use(cookieParser());
  app.use(express.json());
  app.use(createCorrelationIdMiddleware('audit-service'));
  app.use(createRequestLogger('audit-service'));

  app.use(createRoutes({ prisma }));

  return app;
};

module.exports = { createApp };
