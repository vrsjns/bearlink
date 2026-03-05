const bcrypt = require('bcryptjs');
const { createLogger } = require('shared/utils/logger');
const {
  isValidEmail,
  isValidPassword,
  validateRequiredFields,
  validationError,
} = require('shared/utils/validation');
const { generateToken, sanitizeUser } = require('../services/token.service');
const { generateCsrfToken } = require('../services/csrf.service');
const { generateResetToken, buildResetLink } = require('../services/passwordReset.service');

const logger = createLogger('auth-service');

const setTokenCookie = (res, token) => {
  res.cookie('token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 3600000,
  });
};

const createAuthController = ({ prisma, eventPublisher, loginAttemptStore }) => {
  const { isLocked, recordFailedAttempt, clearAttempts } = loginAttemptStore;

  const register = async (req, res) => {
    const { email, password, name } = req.body;

    const { isValid, missing } = validateRequiredFields(req.body, ['email', 'password', 'name']);
    if (!isValid) {
      return validationError(res, 'Missing required fields', { missing });
    }

    if (!isValidEmail(email)) {
      return validationError(res, 'Invalid email format');
    }

    if (!isValidPassword(password)) {
      return validationError(
        res,
        'Password must be at least 8 characters and contain uppercase, lowercase, and a number'
      );
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    try {
      const [user] = await prisma.$transaction([
        prisma.user.create({
          data: { email, password: hashedPassword, name },
        }),
        prisma.outboxEvent.create({
          data: {
            eventType: 'user_registered',
            payload: { email },
          },
        }),
      ]);

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
      if (isLocked(email)) {
        return res
          .status(429)
          .json({ error: 'Too many failed login attempts. Try again in 15 minutes.' });
      }

      const user = await prisma.user.findUnique({ where: { email } });
      if (!user || !(await bcrypt.compare(password, user.password))) {
        recordFailedAttempt(email);
        // Standalone outbox insert — no DB write to wrap
        await prisma.outboxEvent.create({
          data: {
            eventType: 'user_login_failed',
            payload: { email },
          },
        });
        return res.status(400).json({ error: 'Invalid email or password.' });
      }

      clearAttempts(email);
      // Standalone outbox insert — no DB write to wrap
      await prisma.outboxEvent.create({
        data: {
          eventType: 'user_login',
          payload: { userId: user.id, email: user.email },
          actorId: String(user.id),
        },
      });
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

  const getCsrfToken = (req, res) => {
    const jwtToken = req.cookies?.token;
    if (!jwtToken) {
      return res.status(401).json({ error: 'Not authenticated.' });
    }
    res.json({ csrfToken: generateCsrfToken(jwtToken, process.env.JWT_SECRET) });
  };

  const forgotPassword = async (req, res) => {
    const { email } = req.body;

    if (!email || !isValidEmail(email)) {
      return validationError(res, 'A valid email address is required.');
    }

    try {
      const user = await prisma.user.findUnique({ where: { email } });

      if (user) {
        const token = generateResetToken();
        const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

        await prisma.$transaction([
          prisma.passwordResetToken.create({
            data: { token, userId: user.id, expiresAt },
          }),
          prisma.outboxEvent.create({
            data: {
              eventType: 'password_reset_requested',
              payload: { userId: user.id },
              actorId: String(user.id),
            },
          }),
        ]);

        eventPublisher.publishEmailNotification({
          to: email,
          subject: 'Reset your BearLink password',
          text: `Hello ${user.name},\n\nClick the link below to reset your password. The link expires in 1 hour.\n\n${buildResetLink(token)}\n\nIf you did not request a password reset, you can ignore this email.\n\nBearLink Team`,
        });

        eventPublisher.publishPasswordResetRequested({ userId: user.id });

        logger.info('Password reset requested', { userId: user.id });
      }
    } catch (error) {
      logger.error('Error processing forgot-password request', { error: error.message });
    }

    res.json({ message: 'If that email is registered you will receive a reset link shortly.' });
  };

  const resetPassword = async (req, res) => {
    const { token } = req.params;
    const { password } = req.body;

    if (!password) {
      return res.status(400).json({ error: 'Password is required.' });
    }

    if (!isValidPassword(password)) {
      return res.status(400).json({
        error:
          'Password must be at least 8 characters and contain uppercase, lowercase, and a number.',
      });
    }

    try {
      const resetToken = await prisma.passwordResetToken.findUnique({
        where: { token },
        include: { user: true },
      });

      if (!resetToken || resetToken.expiresAt < new Date() || resetToken.usedAt !== null) {
        return res.status(400).json({ error: 'Invalid or expired reset token.' });
      }

      const hashedPassword = await bcrypt.hash(password, 10);

      await prisma.$transaction([
        prisma.user.update({
          where: { id: resetToken.userId },
          data: { password: hashedPassword },
        }),
        prisma.passwordResetToken.update({
          where: { id: resetToken.id },
          data: { usedAt: new Date() },
        }),
        prisma.outboxEvent.create({
          data: {
            eventType: 'password_reset_completed',
            payload: { userId: resetToken.userId },
            actorId: String(resetToken.userId),
          },
        }),
      ]);

      eventPublisher.publishPasswordResetCompleted({ userId: resetToken.userId });

      logger.info('Password reset completed', { userId: resetToken.userId });

      res.json({ message: 'Password reset successful.' });
    } catch (error) {
      logger.error('Error resetting password', { error: error.message });
      res.status(400).json({ error: 'Password reset failed.' });
    }
  };

  return {
    register,
    login,
    logout,
    getCsrfToken,
    forgotPassword,
    resetPassword,
  };
};

module.exports = { createAuthController };
