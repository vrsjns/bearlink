const express = require('express');
const { authLimiter } = require('shared/middlewares/rateLimit');
const { createAuthController } = require('../controllers/auth.controller');

/**
 * Create auth routes with dependencies
 * @param {Object} deps - Dependencies
 * @param {Object} deps.prisma - Prisma client
 * @param {Object} deps.eventPublisher - Event publisher
 * @returns {express.Router} Auth router
 */
const createAuthRoutes = ({ prisma, eventPublisher, loginAttemptStore }) => {
  const router = express.Router();
  const controller = createAuthController({ prisma, eventPublisher, loginAttemptStore });

  router.get('/csrf-token', controller.getCsrfToken);
  router.post('/register', authLimiter, controller.register);
  router.post('/login', authLimiter, controller.login);
  router.post('/logout', controller.logout);

  return router;
};

module.exports = { createAuthRoutes };
