const express = require('express');
const { apiLimiter } = require('shared/middlewares/rateLimit');
const { createEventsController } = require('../controllers/events.controller');

/**
 * Create events routes with dependencies
 * @param {Object} deps - Dependencies
 * @param {Object} deps.prisma - Prisma client
 * @returns {express.Router} Events router
 */
const createEventsRoutes = ({ prisma }) => {
  const router = express.Router();
  const controller = createEventsController({ prisma });

  router.get('/events', apiLimiter, controller.listEvents);

  return router;
};

module.exports = { createEventsRoutes };
