const { createLogger } = require('shared/utils/logger');
const { isValidUrl, validateRequiredFields, validationError } = require('shared/utils/validation');
const { generateShortId } = require('../services/url.service');

const logger = createLogger('url-service');

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
    const { originalUrl } = req.body;
    const { id: userId } = req.user;

    // Validate required fields
    const { isValid, missing } = validateRequiredFields(req.body, ['originalUrl']);
    if (!isValid) {
      return validationError(res, 'Missing required fields', { missing });
    }

    // Validate URL format and protocol
    if (!isValidUrl(originalUrl)) {
      return validationError(res, 'Invalid URL. Must be a valid HTTP or HTTPS URL.');
    }

    const shortId = generateShortId();

    try {
      const newUrl = await prisma.uRL.create({
        data: { originalUrl, shortId, userId },
      });

      eventPublisher.publishUrlCreated(newUrl);

      if (publishPreviewJob) {
        publishPreviewJob({ urlId: newUrl.id, originalUrl });
      }

      res.json({ shortUrl: `${baseUrl}/${shortId}` });
    } catch (error) {
      logger.error('Error shortening URL', { error: error.message });
      res.status(500).json({ error: 'Failed to shorten URL' });
    }
  };

  const updateUrl = async (req, res) => {
    const {
      user: { id: userId },
      params: { id },
      body: { originalURL }
    } = req;

    const urlId = Number.parseInt(id, 10);

    if (!Number.isInteger(urlId)) {
      logger.error('Error updating URL: invalid URL ID', { urlId });
      return res.status(400).json({ error: 'Invalid URL ID.' });
    }

    if (!originalURL) {
      logger.error('Error updating URL: missing original URL');
      return res.status(400).json({ error: 'Missing original URL.' });
    }

    // Validate URL format and protocol
    if (!isValidUrl(originalURL)) {
      return validationError(res, 'Invalid URL. Must be a valid HTTP or HTTPS URL.');
    }

    const urls = await prisma.uRL.update({ where: { userId, id: urlId }, data: { originalUrl: originalURL } });
    res.json(urls);
  };

  const deleteUrl = async (req, res) => {
    const {
      user: { id: userId },
      params: { id }
    } = req;

    const urlId = Number.parseInt(id, 10);

    if (!Number.isInteger(urlId)) {
      logger.error('Error updating URL: invalid URL ID', { urlId });
      return res.status(400).json({ error: 'Invalid URL ID.' });
    }

    try {
      await prisma.uRL.delete({ where: { id: urlId, userId } });
      res.sendStatus(204);
    } catch (error) {
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
