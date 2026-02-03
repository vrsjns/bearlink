const express = require('express');
const { createEventsRoutes } = require('./events.routes');

/**
 * Create combined routes with dependencies
 * @param {Object} deps - Dependencies
 * @param {Object} deps.prisma - Prisma client
 * @returns {express.Router} Combined router
 */
const createRoutes = ({ prisma }) => {
  const router = express.Router();

  // Mount events routes
  router.use(createEventsRoutes({ prisma }));

  return router;
};

module.exports = { createRoutes };
