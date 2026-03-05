const bcrypt = require('bcryptjs');
const { createLogger } = require('shared/utils/logger');
const {
  isValidEmail,
  isValidPassword,
  isValidName,
  validateRequiredFields,
  validationError,
} = require('shared/utils/validation');
const { generateToken, sanitizeUser } = require('../services/token.service');

const logger = createLogger('auth-service');

const createUsersController = ({ prisma }) => {
  const listUsers = async (req, res) => {
    const users = await prisma.user.findMany();
    res.json(users.map(sanitizeUser));
  };

  const getUser = async (req, res) => {
    const userId = parseInt(req.params.userId);
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      return res.status(404).json({ error: 'User not found.' });
    }
    res.json(sanitizeUser(user));
  };

  const updateUser = async (req, res) => {
    const userId = parseInt(req.params.userId);
    const { name, email, currentPassword } = req.body;

    try {
      const user = await prisma.user.findUnique({ where: { id: userId } });
      if (!user) {
        return res.status(404).json({ error: 'User not found.' });
      }

      const updateData = {};

      if (name !== undefined) {
        if (!isValidName(name)) {
          return validationError(res, 'Name must be 1-100 characters');
        }
        updateData.name = name.trim();
      }

      if (email !== undefined && email !== user.email) {
        if (!isValidEmail(email)) {
          return validationError(res, 'Invalid email format');
        }

        if (!currentPassword) {
          return res.status(403).json({ error: 'Current password required to change email.' });
        }

        const isPasswordValid = await bcrypt.compare(currentPassword, user.password);
        if (!isPasswordValid) {
          return res.status(403).json({ error: 'Invalid current password.' });
        }

        const existingUser = await prisma.user.findUnique({ where: { email } });
        if (existingUser) {
          return res.status(409).json({ error: 'Email already in use.' });
        }

        updateData.email = email;
      }

      if (Object.keys(updateData).length === 0) {
        return res.json({ user: sanitizeUser(user) });
      }

      const changedFields = Object.keys(updateData);

      const [updatedUser] = await prisma.$transaction([
        prisma.user.update({
          where: { id: userId },
          data: updateData,
        }),
        prisma.outboxEvent.create({
          data: {
            eventType: 'user_profile_updated',
            payload: { userId, changedFields },
            actorId: String(userId),
          },
        }),
      ]);

      logger.info('User profile updated', { userId, fields: changedFields });

      res.json({
        user: sanitizeUser(updatedUser),
        token: generateToken(updatedUser),
      });
    } catch (error) {
      logger.error('Error updating user profile', { error: error.message, userId });
      res.status(500).json({ error: 'Failed to update profile.' });
    }
  };

  const deleteUser = async (req, res) => {
    const userId = parseInt(req.params.userId);

    if (req.user.id === userId) {
      return res.status(400).json({ error: 'Admins cannot delete their own account.' });
    }

    try {
      const user = await prisma.user.findUnique({ where: { id: userId } });
      if (!user) {
        return res.status(404).json({ error: 'User not found.' });
      }

      await prisma.$transaction([
        prisma.user.delete({ where: { id: userId } }),
        prisma.outboxEvent.create({
          data: {
            eventType: 'user_deleted',
            payload: { deletedUserId: userId, byUserId: req.user.id },
            actorId: String(req.user.id),
          },
        }),
      ]);

      logger.info('User deleted', { deletedUserId: userId, byUserId: req.user.id });
      res.sendStatus(204);
    } catch (error) {
      logger.error('Error deleting user', { error: error.message, userId });
      res.status(500).json({ error: 'Failed to delete user.' });
    }
  };

  const getProfile = async (req, res) => {
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
  };

  const changePassword = async (req, res) => {
    const userId = parseInt(req.params.userId);
    const { currentPassword, newPassword } = req.body;

    const { isValid, missing } = validateRequiredFields(req.body, [
      'currentPassword',
      'newPassword',
    ]);
    if (!isValid) {
      return validationError(res, 'Missing required fields', { missing });
    }

    try {
      const user = await prisma.user.findUnique({ where: { id: userId } });
      if (!user) {
        return res.status(404).json({ error: 'User not found.' });
      }

      const isPasswordValid = await bcrypt.compare(currentPassword, user.password);
      if (!isPasswordValid) {
        return res.status(403).json({ error: 'Invalid current password.' });
      }

      if (!isValidPassword(newPassword)) {
        return validationError(
          res,
          'Password must be at least 8 characters and contain uppercase, lowercase, and a number'
        );
      }

      const isSamePassword = await bcrypt.compare(newPassword, user.password);
      if (isSamePassword) {
        return validationError(res, 'New password must be different from current password');
      }

      const hashedPassword = await bcrypt.hash(newPassword, 10);

      await prisma.$transaction([
        prisma.user.update({
          where: { id: userId },
          data: { password: hashedPassword },
        }),
        prisma.outboxEvent.create({
          data: {
            eventType: 'user_password_changed',
            payload: { userId },
            actorId: String(userId),
          },
        }),
      ]);

      logger.info('User password changed', { userId });
      res.json({ message: 'Password changed successfully.' });
    } catch (error) {
      logger.error('Error changing password', { error: error.message, userId });
      res.status(500).json({ error: 'Failed to change password.' });
    }
  };

  return {
    listUsers,
    getUser,
    updateUser,
    deleteUser,
    getProfile,
    changePassword,
  };
};

module.exports = { createUsersController };
