const { createLogger } = require('shared/utils/logger');
const { isValidUrl, validateRequiredFields, validationError } = require('shared/utils/validation');
const { generateShortId } = require('../services/url.service');

const logger = createLogger('url-service');

const VALID_REDIRECT_TYPES = [301, 302];
const MAX_SHORTID_RETRIES = 3;

/**
 * Create URLs controller with dependencies
 * @param {Object} deps - Dependencies
 * @param {Object} deps.prisma - Prisma client
 * @param {Object} deps.eventPublisher - Event publisher
 * @param {string} deps.baseUrl - Base URL for short links
 * @returns {Object} Controller methods
 */
const createUrlsController = ({ prisma, eventPublisher, baseUrl, publishPreviewJob }) => {
  const listUrls = async (req, res) => {
    const { user: { id: userId } } = req;
    const urls = await prisma.uRL.findMany({ where: { userId } });
    res.json(urls);
  };

  const createUrl = async (req, res) => {
    const { originalUrl, redirectType = 302 } = req.body;
    const { id: userId } = req.user;

    const { isValid, missing } = validateRequiredFields(req.body, ['originalUrl']);
    if (!isValid) {
      return validationError(res, 'Missing required fields', { missing });
    }

    if (!isValidUrl(originalUrl)) {
      return validationError(res, 'Invalid URL. Must be a valid HTTP or HTTPS URL.');
    }

    if (!VALID_REDIRECT_TYPES.includes(redirectType)) {
      return validationError(res, 'redirectType must be 301 or 302.');
    }

    try {
      let newUrl;
      for (let attempt = 0; attempt < MAX_SHORTID_RETRIES; attempt++) {
        try {
          newUrl = await prisma.uRL.create({
            data: { originalUrl, shortId: generateShortId(), userId, redirectType },
          });
          break;
        } catch (error) {
          if (error.code === 'P2002' && attempt < MAX_SHORTID_RETRIES - 1) {
            logger.warn('shortId collision, retrying', { attempt: attempt + 1 });
            continue;
          }
          throw error;
        }
      }

      eventPublisher.publishUrlCreated(newUrl);

      if (publishPreviewJob) {
        publishPreviewJob({ urlId: newUrl.id, originalUrl });
      }

      res.json({ shortUrl: `${baseUrl}/${newUrl.shortId}` });
    } catch (error) {
      logger.error('Error shortening URL', { error: error.message });
      res.status(500).json({ error: 'Failed to shorten URL' });
    }
  };

  const updateUrl = async (req, res) => {
    const {
      user: { id: userId },
      params: { id },
      body: { originalUrl, redirectType }
    } = req;

    const urlId = Number.parseInt(id, 10);

    if (!Number.isInteger(urlId)) {
      logger.error('Error updating URL: invalid URL ID', { urlId });
      return res.status(400).json({ error: 'Invalid URL ID.' });
    }

    if (!originalUrl) {
      logger.error('Error updating URL: missing original URL');
      return res.status(400).json({ error: 'Missing original URL.' });
    }

    if (!isValidUrl(originalUrl)) {
      return validationError(res, 'Invalid URL. Must be a valid HTTP or HTTPS URL.');
    }

    if (redirectType !== undefined && !VALID_REDIRECT_TYPES.includes(redirectType)) {
      return validationError(res, 'redirectType must be 301 or 302.');
    }

    const data = { originalUrl };
    if (redirectType !== undefined) {
      data.redirectType = redirectType;
    }

    try {
      const updatedUrl = await prisma.uRL.update({ where: { userId, id: urlId }, data });
      eventPublisher.publishUrlUpdated(updatedUrl);
      res.json(updatedUrl);
    } catch (error) {
      if (error.code === 'P2025') {
        return res.status(404).json({ error: 'URL not found.' });
      }
      logger.error('Error updating URL', { error: error.message });
      res.status(500).json({ error: 'Failed to update URL' });
    }
  };

  const deleteUrl = async (req, res) => {
    const {
      user: { id: userId },
      params: { id }
    } = req;

    const urlId = Number.parseInt(id, 10);

    if (!Number.isInteger(urlId)) {
      logger.error('Error deleting URL: invalid URL ID', { urlId });
      return res.status(400).json({ error: 'Invalid URL ID.' });
    }

    try {
      const deletedUrl = await prisma.uRL.delete({ where: { id: urlId, userId } });
      eventPublisher.publishUrlDeleted(deletedUrl);
      res.sendStatus(204);
    } catch (error) {
      if (error.code === 'P2025') {
        return res.status(404).json({ error: 'URL not found.' });
      }
      logger.error('Error deleting URL', { error: error.message });
      res.status(500).json({ error: 'Failed to delete URL' });
    }
  };

  return {
    listUrls,
    createUrl,
    updateUrl,
    deleteUrl,
  };
};

module.exports = { createUrlsController };
