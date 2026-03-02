const express = require('express');
const { createEventsRoutes } = require('./events.routes');
const { createAnalyticsRoutes } = require('./analytics.routes');

/**
 * Create combined routes with dependencies
 * @param {Object} deps - Dependencies
 * @param {Object} deps.prisma - Prisma client
 * @returns {express.Router} Combined router
 */
const createRoutes = ({ prisma }) => {
  const router = express.Router();

  router.use(createEventsRoutes({ prisma }));
  router.use(createAnalyticsRoutes({ prisma }));

  return router;
};

module.exports = { createRoutes };
