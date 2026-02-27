const express = require('express');
const { createUrlsRoutes } = require('./urls.routes');
const { createRedirectRoutes } = require('./redirect.routes');

/**
 * Create combined routes with dependencies
 * @param {Object} deps - Dependencies
 * @param {Object} deps.prisma - Prisma client
 * @param {Object} deps.eventPublisher - Event publisher
 * @param {string} deps.baseUrl - Base URL for short links
 * @returns {express.Router} Combined router
 */
const createRoutes = ({ prisma, eventPublisher, baseUrl, publishPreviewJob }) => {
  const router = express.Router();

  // Mount URLs routes (CRUD operations)
  router.use(createUrlsRoutes({ prisma, eventPublisher, baseUrl, publishPreviewJob }));

  // Mount redirect routes (must be last due to /:shortId pattern)
  router.use(createRedirectRoutes({ prisma, eventPublisher }));

  return router;
};

module.exports = { createRoutes };
