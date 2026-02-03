const { createLogger } = require('shared/utils/logger');
const { isSafeRedirectUrl } = require('shared/utils/validation');

const logger = createLogger('url-service');

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
      const url = await prisma.uRL.findUnique({ where: { shortId } });
      if (url) {
        // Validate URL is safe for redirect (prevents open redirect attacks)
        if (!isSafeRedirectUrl(url.originalUrl)) {
          logger.warn('Blocked unsafe redirect attempt', { originalUrl: url.originalUrl });
          return res.status(400).json({ error: 'URL is not safe for redirect' });
        }

        await prisma.uRL.update({
          where: { shortId },
          data: { clicks: { increment: 1 } },
        });

        eventPublisher.publishUrlClicked({ shortId, originalUrl: url.originalUrl });

        res.redirect(url.originalUrl);
      } else {
        res.status(404).json({ error: 'URL not found' });
      }
    } catch (error) {
      logger.error('Error fetching URL', { error: error.message });
      res.status(500).json({ error: 'Failed to redirect' });
    }
  };

  return {
    redirect,
  };
};

module.exports = { createRedirectController };
