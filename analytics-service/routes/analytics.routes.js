const express = require('express');
const { apiLimiter } = require('shared/middlewares/rateLimit');
const { authenticateJWT, isAdmin } = require('shared/middlewares/auth');
const { createAnalyticsController } = require('../controllers/analytics.controller');

/**
 * Create analytics routes with dependencies
 * @param {Object} deps - Dependencies
 * @param {Object} deps.prisma - Prisma client
 * @returns {express.Router} Analytics router
 */
const createAnalyticsRoutes = ({ prisma }) => {
  const router = express.Router();
  const controller = createAnalyticsController({ prisma });

  router.get(
    '/analytics/urls/:shortId/clicks',
    authenticateJWT,
    apiLimiter,
    controller.getUrlClicks
  );
  router.get('/analytics/summary', authenticateJWT, isAdmin, apiLimiter, controller.getSummary);
  router.get('/analytics/top-urls', authenticateJWT, isAdmin, apiLimiter, controller.getTopUrls);

  return router;
};

module.exports = { createAnalyticsRoutes };
