const bcrypt = require('bcryptjs');
const { createLogger } = require('shared/utils/logger');
const { isValidEmail, isValidPassword, validateRequiredFields, validationError } = require('shared/utils/validation');
const { generateToken, sanitizeUser } = require('../services/token.service');

const logger = createLogger('auth-service');

const setTokenCookie = (res, token) => {
  res.cookie('token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 3600000,
  });
};

/**
 * Create auth controller with dependencies
 * @param {Object} deps - Dependencies
 * @param {Object} deps.prisma - Prisma client
 * @param {Object} deps.eventPublisher - Event publisher
 * @returns {Object} Controller methods
 */
const createAuthController = ({ prisma, eventPublisher }) => {
  const register = async (req, res) => {
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

      setTokenCookie(res, generateToken(user));
      res.json({ user: sanitizeUser(user) });
    } catch (error) {
      logger.error('Error registering user', { error: error.message });
      res.status(400).json({ error: 'User registration failed.' });
    }
  };

  const login = async (req, res) => {
    const { email, password } = req.body;
    try {
      const user = await prisma.user.findUnique({ where: { email } });
      if (!user || !await bcrypt.compare(password, user.password)) {
        return res.status(400).json({ error: 'Invalid email or password.' });
      }
      setTokenCookie(res, generateToken(user));
      res.json({ user: sanitizeUser(user) });
    } catch (error) {
      logger.error('Error logging in user', { error: error.message });
      res.status(400).json({ error: 'User login failed.' });
    }
  };

  const logout = (req, res) => {
    res.clearCookie('token');
    res.sendStatus(204);
  };

  return {
    register,
    login,
    logout,
  };
};

module.exports = { createAuthController };
