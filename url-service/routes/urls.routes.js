const express = require('express');
const { authenticateJWT } = require('shared/middlewares/auth');
const { apiLimiter } = require('shared/middlewares/rateLimit');
const { createUrlsController } = require('../controllers/urls.controller');

/**
 * Create URLs routes with dependencies
 * @param {Object} deps - Dependencies
 * @param {Object} deps.prisma - Prisma client
 * @param {Object} deps.eventPublisher - Event publisher
 * @param {string} deps.baseUrl - Base URL for short links
 * @returns {express.Router} URLs router
 */
const createUrlsRoutes = ({ prisma, eventPublisher, baseUrl, publishPreviewJob }) => {
  const router = express.Router();
  const controller = createUrlsController({ prisma, eventPublisher, baseUrl, publishPreviewJob });

  router.get('/urls', authenticateJWT, apiLimiter, controller.listUrls);
  router.post('/urls', authenticateJWT, apiLimiter, controller.createUrl);
  router.put('/urls/:id', authenticateJWT, apiLimiter, controller.updateUrl);
  router.delete('/urls/:id', authenticateJWT, apiLimiter, controller.deleteUrl);

  return router;
};

module.exports = { createUrlsRoutes };
