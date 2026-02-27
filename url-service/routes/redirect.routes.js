const express = require('express');
const { redirectLimiter } = require('shared/middlewares/rateLimit');
const { createRedirectController } = require('../controllers/redirect.controller');

/**
 * Create redirect routes with dependencies
 * @param {Object} deps - Dependencies
 * @param {Object} deps.prisma - Prisma client
 * @param {Object} deps.eventPublisher - Event publisher
 * @param {string} deps.baseUrl - Base URL for short links
 * @returns {express.Router} Redirect router
 */
const createRedirectRoutes = ({ prisma, eventPublisher, baseUrl }) => {
  const router = express.Router();
  const controller = createRedirectController({ prisma, eventPublisher, baseUrl });

  // Generate a QR code PNG for a short link (public endpoint)
  router.get('/:shortId/qr', redirectLimiter, controller.qr);

  // Unlock a password-protected link (public endpoint)
  router.post('/:shortId/unlock', redirectLimiter, controller.unlock);

  // Redirect to original URL based on short ID or custom alias (public endpoint)
  router.get('/:shortId', redirectLimiter, controller.redirect);

  return router;
};

module.exports = { createRedirectRoutes };
