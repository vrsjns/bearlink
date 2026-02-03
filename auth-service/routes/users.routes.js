const express = require('express');
const { authenticateJWT, isAdmin, isSelfOrAdmin } = require('shared/middlewares/auth');
const { apiLimiter, authLimiter } = require('shared/middlewares/rateLimit');
const { createUsersController } = require('../controllers/users.controller');

/**
 * Create users routes with dependencies
 * @param {Object} deps - Dependencies
 * @param {Object} deps.prisma - Prisma client
 * @returns {express.Router} Users router
 */
const createUsersRoutes = ({ prisma }) => {
  const router = express.Router();
  const controller = createUsersController({ prisma });

  // Get current user's profile
  router.get('/profile', authenticateJWT, apiLimiter, controller.getProfile);

  // Get all users (Admin only)
  router.get('/users', authenticateJWT, isAdmin, apiLimiter, controller.listUsers);

  // Get user by ID (Admin or self)
  router.get('/users/:userId', authenticateJWT, isSelfOrAdmin, apiLimiter, controller.getUser);

  // Update user profile (self or admin)
  router.put('/users/:userId', authenticateJWT, isSelfOrAdmin, apiLimiter, controller.updateUser);

  // Delete a user (Admin only)
  router.delete('/users/:userId', authenticateJWT, isAdmin, apiLimiter, controller.deleteUser);

  // Change password (self or admin)
  router.post('/users/:userId/password', authenticateJWT, isSelfOrAdmin, authLimiter, controller.changePassword);

  return router;
};

module.exports = { createUsersRoutes };
