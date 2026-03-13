const express = require('express');
const { createAuthRoutes } = require('./auth.routes');
const { createUsersRoutes } = require('./users.routes');

/**
 * Create combined routes with dependencies
 * @param {Object} deps - Dependencies
 * @param {Object} deps.prisma - Prisma client
 * @param {Object} deps.eventPublisher - Event publisher
 * @returns {express.Router} Combined router
 */
const createRoutes = ({ prisma, eventPublisher, loginAttemptStore }) => {
  const router = express.Router();

  // Mount auth routes (register, login)
  router.use(createAuthRoutes({ prisma, eventPublisher, loginAttemptStore }));

  // Mount users routes (profile, users CRUD, password)
  router.use(createUsersRoutes({ prisma }));

  return router;
};

module.exports = { createRoutes };
