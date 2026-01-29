require('dotenv').config();
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { PrismaClient } = require('@prisma/client');

const { connectRabbitMQ } = require('shared/utils/rabbitmq');
const { createLogger } = require('shared/utils/logger');
const { authenticateJWT, isAdmin, isSelfOrAdmin } = require('shared/middlewares/auth');
const { corsMiddleware } = require('shared/middlewares/cors');
const { authLimiter, apiLimiter } = require('shared/middlewares/rateLimit');
const { isValidEmail, isValidPassword, isValidName, validateRequiredFields, validationError } = require('shared/utils/validation');
const { healthHandler, createReadinessHandler } = require('shared/utils/healthCheck');
const { createEventPublisher, QUEUES } = require('shared/events');
const { createCorrelationIdMiddleware } = require('shared/middlewares/correlationId');
const { createRequestLogger } = require('shared/middlewares/requestLogger');

const logger = createLogger('auth-service');
const prisma = new PrismaClient();
const app = express();

app.use(corsMiddleware);
app.use(express.json());
app.use(createCorrelationIdMiddleware('auth-service'));
app.use(createRequestLogger('auth-service'));

const generateToken = (user) => jwt.sign(
  { id: user.id, email: user.email, name: user.name, role: user.role },
  process.env.JWT_SECRET,
  { expiresIn: process.env.JWT_EXPIRES_IN || '1h' }
);

const sanitizeUser = (user) => {
  const { password, ...sanitized } = user;
  return sanitized;
};

// Health check endpoints
app.get('/health', healthHandler);

let rabbitChannel = null;

connectRabbitMQ().then((channel) => {
  rabbitChannel = channel;
  channel.assertQueue(QUEUES.EVENTS);
  channel.assertQueue(QUEUES.EMAIL_NOTIFICATIONS);

  const eventPublisher = createEventPublisher(channel);

  app.post('/register', authLimiter, async (req, res) => {
    const { email, password, name } = req.body;

    // Validate required fields
    const { isValid, missing } = validateRequiredFields(req.body, ['email', 'password', 'name']);
    if (!isValid) {
      return validationError(res, 'Missing required fields', { missing });
    }

    // Validate email format
    if (!isValidEmail(email)) {
      return validationError(res, 'Invalid email format');
    }

    // Validate password strength
    if (!isValidPassword(password)) {
      return validationError(res, 'Password must be at least 8 characters and contain uppercase, lowercase, and a number');
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    try {
      const user = await prisma.user.create({
        data: { email, password: hashedPassword, name },
      });

      logger.info('User registered', { email: user?.email, userId: user?.id });

      eventPublisher.publishUserRegistered(sanitizeUser(user));
      eventPublisher.publishEmailNotification({
        to: email,
        subject: 'Welcome to BearLink!',
        text: `Hello ${name},\n\nThank you for registering at BearLink.\n\nBest Regards,\nBearLink Team`,
      });

      res.json({ token: generateToken(user) });
    } catch (error) {
      logger.error('Error registering user', { error: error.message });
      res.status(400).json({ error: 'User registration failed.' });
    }
  });

  app.post('/login', authLimiter, async (req, res) => {
    const { email, password } = req.body;
    try {
      const user = await prisma.user.findUnique({ where: { email } });
      if (!user || !await bcrypt.compare(password, user.password)) {
        return res.status(400).json({ error: 'Invalid email or password.' });
      }
      res.json({ token: generateToken(user) });
    } catch (error) {
      logger.error('Error logging in user', { error: error.message });
      res.status(400).json({ error: 'User login failed.' });
    }
  });

  // Get all users (Admin only)
  app.get('/users', authenticateJWT, isAdmin, apiLimiter, async (req, res) => {
    const users = await prisma.user.findMany();
    res.json(users.map(sanitizeUser));
  });

  // Get user by ID (Admin or self)
  app.get('/users/:userId', authenticateJWT, isSelfOrAdmin, apiLimiter, async (req, res) => {
    const userId = parseInt(req.params.userId);
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      return res.status(404).json({ error: 'User not found.' });
    }
    res.json(sanitizeUser(user));
  });

  // Delete a user (Admin only)
  app.delete('/users/:userId', authenticateJWT, isAdmin, apiLimiter, async (req, res) => {
    const userId = parseInt(req.params.userId);
    await prisma.user.delete({ where: { id: userId } });
    res.sendStatus(204);
  });

  // Get current user's profile
  app.get('/profile', authenticateJWT, apiLimiter, async (req, res) => {
    try {
      const user = await prisma.user.findUnique({ where: { id: req.user.id } });
      if (!user) {
        return res.status(404).json({ error: 'User not found.' });
      }
      res.json(sanitizeUser(user));
    } catch (error) {
      logger.error('Error fetching profile', { error: error.message, userId: req.user.id });
      res.status(500).json({ error: 'Failed to fetch profile.' });
    }
  });

  // Update user profile (self or admin)
  app.put('/users/:userId', authenticateJWT, isSelfOrAdmin, apiLimiter, async (req, res) => {
    const userId = parseInt(req.params.userId);
    const { name, email, currentPassword } = req.body;

    try {
      const user = await prisma.user.findUnique({ where: { id: userId } });
      if (!user) {
        return res.status(404).json({ error: 'User not found.' });
      }

      // Build update data with explicit whitelist (no mass assignment)
      const updateData = {};

      // Validate and set name if provided
      if (name !== undefined) {
        if (!isValidName(name)) {
          return validationError(res, 'Name must be 1-100 characters');
        }
        updateData.name = name.trim();
      }

      // Validate and set email if provided
      if (email !== undefined && email !== user.email) {
        if (!isValidEmail(email)) {
          return validationError(res, 'Invalid email format');
        }

        // Email change requires password verification
        if (!currentPassword) {
          return res.status(403).json({ error: 'Current password required to change email.' });
        }

        const isPasswordValid = await bcrypt.compare(currentPassword, user.password);
        if (!isPasswordValid) {
          return res.status(403).json({ error: 'Invalid current password.' });
        }

        // Check email uniqueness
        const existingUser = await prisma.user.findUnique({ where: { email } });
        if (existingUser) {
          return res.status(409).json({ error: 'Email already in use.' });
        }

        updateData.email = email;
      }

      // Only update if there are changes
      if (Object.keys(updateData).length === 0) {
        return res.json({ user: sanitizeUser(user) });
      }

      const updatedUser = await prisma.user.update({
        where: { id: userId },
        data: updateData,
      });

      logger.info('User profile updated', { userId, fields: Object.keys(updateData) });

      // Return new token since name/email might be in token payload
      res.json({
        user: sanitizeUser(updatedUser),
        token: generateToken(updatedUser),
      });
    } catch (error) {
      logger.error('Error updating user profile', { error: error.message, userId });
      res.status(500).json({ error: 'Failed to update profile.' });
    }
  });

  // Change password (self or admin)
  app.post('/users/:userId/password', authenticateJWT, isSelfOrAdmin, authLimiter, async (req, res) => {
    const userId = parseInt(req.params.userId);
    const { currentPassword, newPassword } = req.body;

    // Validate required fields
    const { isValid, missing } = validateRequiredFields(req.body, ['currentPassword', 'newPassword']);
    if (!isValid) {
      return validationError(res, 'Missing required fields', { missing });
    }

    try {
      const user = await prisma.user.findUnique({ where: { id: userId } });
      if (!user) {
        return res.status(404).json({ error: 'User not found.' });
      }

      // Verify current password
      const isPasswordValid = await bcrypt.compare(currentPassword, user.password);
      if (!isPasswordValid) {
        return res.status(403).json({ error: 'Invalid current password.' });
      }

      // Validate new password strength
      if (!isValidPassword(newPassword)) {
        return validationError(res, 'Password must be at least 8 characters and contain uppercase, lowercase, and a number');
      }

      // Prevent reusing the same password
      const isSamePassword = await bcrypt.compare(newPassword, user.password);
      if (isSamePassword) {
        return validationError(res, 'New password must be different from current password');
      }

      const hashedPassword = await bcrypt.hash(newPassword, 10);
      await prisma.user.update({
        where: { id: userId },
        data: { password: hashedPassword },
      });

      logger.info('User password changed', { userId });
      res.json({ message: 'Password changed successfully.' });
    } catch (error) {
      logger.error('Error changing password', { error: error.message, userId });
      res.status(500).json({ error: 'Failed to change password.' });
    }
  });

  // Readiness check with database and RabbitMQ verification
  app.get('/ready', createReadinessHandler({
    database: async () => { await prisma.$queryRaw`SELECT 1`; },
    rabbitmq: async () => { if (!rabbitChannel) throw new Error('RabbitMQ not connected'); },
  }));

  const server = app.listen(process.env.PORT || 4000, () => {
    logger.info(`Auth service running on port ${process.env.PORT || 4000}`);
  });

  process.on('SIGTERM', gracefulShutdown(server));
  process.on('SIGINT', gracefulShutdown(server));
}).catch(error => {
  logger.error('Error connecting to RabbitMQ', { error: error.message });
  process.exit(1);
});

const gracefulShutdown = server => async () => {
  logger.info('Shutting down gracefully...');

  server.close(async () => {
    logger.info('Server closed.');

    // Disconnect Prisma
    await prisma.$disconnect();
    logger.info('Prisma disconnected.');

    process.exit(0);
  });

  // Force close the server after 5 seconds
  setTimeout(() => {
    logger.error('Could not close connections in time, forcefully shutting down');
    process.exit(1);
  }, 5000);
}
