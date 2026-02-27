const bcrypt = require('bcryptjs');
const { createLogger } = require('shared/utils/logger');
const { isSafeRedirectUrl } = require('shared/utils/validation');

const logger = createLogger('url-service');

/**
 * Look up a URL by shortId OR customAlias
 */
const findUrl = (prisma, slug) =>
  prisma.uRL.findFirst({ where: { OR: [{ shortId: slug }, { customAlias: slug }] } });

/**
 * Create redirect controller with dependencies
 * @param {Object} deps - Dependencies
 * @param {Object} deps.prisma - Prisma client
 * @param {Object} deps.eventPublisher - Event publisher
 * @returns {Object} Controller methods
 */
const createRedirectController = ({ prisma, eventPublisher }) => {
  const redirect = async (req, res) => {
    const { shortId } = req.params;

    try {
      const url = await findUrl(prisma, shortId);

      if (!url) {
        return res.status(404).json({ error: 'URL not found' });
      }

      if (!isSafeRedirectUrl(url.originalUrl)) {
        logger.warn('Blocked unsafe redirect attempt', { originalUrl: url.originalUrl });
        return res.status(400).json({ error: 'URL is not safe for redirect' });
      }

      if (url.expiresAt && url.expiresAt < new Date()) {
        return res.status(410).json({ error: 'This link has expired.' });
      }

      if (url.passwordHash) {
        return res.status(401).json({ error: 'Password required.', requiresPassword: true });
      }

      await prisma.uRL.update({
        where: { shortId: url.shortId },
        data: { clicks: { increment: 1 } },
      });

      eventPublisher.publishUrlClicked({ shortId: url.shortId, originalUrl: url.originalUrl });

      res.redirect(url.redirectType, url.originalUrl);
    } catch (error) {
      logger.error('Error fetching URL', { error: error.message });
      res.status(500).json({ error: 'Failed to redirect' });
    }
  };

  const unlock = async (req, res) => {
    const { shortId } = req.params;
    const { password } = req.body;

    if (!password) {
      return res.status(400).json({ error: 'Password is required.' });
    }

    try {
      const url = await findUrl(prisma, shortId);

      if (!url) {
        return res.status(404).json({ error: 'URL not found' });
      }

      if (!url.passwordHash) {
        return res.status(400).json({ error: 'This link is not password protected.' });
      }

      if (!isSafeRedirectUrl(url.originalUrl)) {
        logger.warn('Blocked unsafe redirect attempt', { originalUrl: url.originalUrl });
        return res.status(400).json({ error: 'URL is not safe for redirect' });
      }

      if (url.expiresAt && url.expiresAt < new Date()) {
        return res.status(410).json({ error: 'This link has expired.' });
      }

      const isValid = await bcrypt.compare(password, url.passwordHash);
      if (!isValid) {
        return res.status(401).json({ error: 'Incorrect password.' });
      }

      await prisma.uRL.update({
        where: { shortId: url.shortId },
        data: { clicks: { increment: 1 } },
      });

      eventPublisher.publishUrlClicked({ shortId: url.shortId, originalUrl: url.originalUrl });

      res.redirect(url.redirectType, url.originalUrl);
    } catch (error) {
      logger.error('Error unlocking URL', { error: error.message });
      res.status(500).json({ error: 'Failed to unlock' });
    }
  };

  return { redirect, unlock };
};

module.exports = { createRedirectController };
