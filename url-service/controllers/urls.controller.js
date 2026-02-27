const bcrypt = require('bcryptjs');
const { createLogger } = require('shared/utils/logger');
const { isValidUrl, validateRequiredFields, validationError } = require('shared/utils/validation');
const { generateShortId } = require('../services/url.service');

const logger = createLogger('url-service');

const VALID_REDIRECT_TYPES = [301, 302];
const MAX_SHORTID_RETRIES = 3;
const ALIAS_REGEX = /^[a-zA-Z0-9_-]{3,50}$/;
const RESERVED_SLUGS = ['urls', 'health', 'ready'];
const BULK_MAX_ITEMS = 50;

/**
 * Strip passwordHash before publishing to events
 */
const sanitizeForEvent = ({ passwordHash, ...url }) => url;

/**
 * Validate and parse a custom alias. Returns an error string or null.
 */
const validateAlias = (alias) => {
  if (!ALIAS_REGEX.test(alias)) {
    return 'Custom alias must be 3-50 characters and contain only letters, numbers, hyphens, and underscores.';
  }
  if (RESERVED_SLUGS.includes(alias.toLowerCase())) {
    return 'This custom alias is reserved.';
  }
  return null;
};

/**
 * Validate and parse an expiresAt value. Returns { date } or { error }.
 */
const parseExpiresAt = (expiresAt) => {
  if (expiresAt === null) return { date: null };
  const date = new Date(expiresAt);
  if (isNaN(date.getTime())) {
    return { error: 'expiresAt must be a valid ISO 8601 date.' };
  }
  if (date <= new Date()) {
    return { error: 'expiresAt must be in the future.' };
  }
  return { date };
};

/**
 * Validate utmParams: must be null/undefined or a plain object with string/number values.
 * Returns an error string or null.
 */
const validateUtmParams = (utmParams) => {
  if (utmParams === null || utmParams === undefined) return null;
  if (typeof utmParams !== 'object' || Array.isArray(utmParams)) {
    return 'utmParams must be a plain object.';
  }
  for (const [key, value] of Object.entries(utmParams)) {
    if (typeof value !== 'string' && typeof value !== 'number') {
      return `utmParams.${key} must be a string or number.`;
    }
  }
  return null;
};

/**
 * Create URLs controller with dependencies
 * @param {Object} deps - Dependencies
 * @param {Object} deps.prisma - Prisma client
 * @param {Object} deps.eventPublisher - Event publisher
 * @param {string} deps.baseUrl - Base URL for short links
 * @returns {Object} Controller methods
 */
const DEFAULT_PAGE_LIMIT = 20;
const MAX_PAGE_LIMIT = 100;

const createUrlsController = ({ prisma, eventPublisher, baseUrl, publishPreviewJob }) => {
  const listUrls = async (req, res) => {
    const { user: { id: userId } } = req;

    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(MAX_PAGE_LIMIT, Math.max(1, parseInt(req.query.limit) || DEFAULT_PAGE_LIMIT));
    const skip = (page - 1) * limit;

    const where = { userId };
    const conditions = [];

    if (req.query.tag) {
      conditions.push({ tags: { has: req.query.tag } });
    }

    if (req.query.search) {
      conditions.push({
        OR: [
          { originalUrl: { contains: req.query.search, mode: 'insensitive' } },
          { customAlias: { contains: req.query.search, mode: 'insensitive' } },
        ],
      });
    }

    if (req.query.expired === 'true') {
      conditions.push({ expiresAt: { lt: new Date() } });
    } else if (req.query.expired === 'false') {
      conditions.push({ OR: [{ expiresAt: null }, { expiresAt: { gte: new Date() } }] });
    }

    if (conditions.length > 0) {
      where.AND = conditions;
    }

    const [urls, total] = await Promise.all([
      prisma.uRL.findMany({ where, skip, take: limit, orderBy: { createdAt: 'desc' } }),
      prisma.uRL.count({ where }),
    ]);

    res.json({
      data: urls,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  };

  const createUrl = async (req, res) => {
    const {
      originalUrl,
      redirectType = 302,
      customAlias,
      expiresAt,
      password,
      tags = [],
      utmParams,
    } = req.body;
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

    if (customAlias !== undefined) {
      const aliasError = validateAlias(customAlias);
      if (aliasError) return validationError(res, aliasError);
    }

    let expiresAtDate;
    if (expiresAt !== undefined) {
      const result = parseExpiresAt(expiresAt);
      if (result.error) return validationError(res, result.error);
      expiresAtDate = result.date;
    }

    if (!Array.isArray(tags) || tags.some((t) => typeof t !== 'string')) {
      return validationError(res, 'tags must be an array of strings.');
    }

    if (utmParams !== undefined) {
      const utmError = validateUtmParams(utmParams);
      if (utmError) return validationError(res, utmError);
    }

    let passwordHash;
    if (password !== undefined) {
      passwordHash = await bcrypt.hash(password, 10);
    }

    try {
      let newUrl;

      if (customAlias) {
        // Custom alias — single attempt; P2002 means the alias is taken
        try {
          newUrl = await prisma.uRL.create({
            data: { originalUrl, shortId: generateShortId(), customAlias, userId, redirectType, expiresAt: expiresAtDate, passwordHash, tags, utmParams },
          });
        } catch (error) {
          if (error.code === 'P2002') {
            return res.status(409).json({ error: 'Custom alias is already taken.' });
          }
          throw error;
        }
      } else {
        // Auto-generated shortId — retry on collision
        for (let attempt = 0; attempt < MAX_SHORTID_RETRIES; attempt++) {
          try {
            newUrl = await prisma.uRL.create({
              data: { originalUrl, shortId: generateShortId(), userId, redirectType, expiresAt: expiresAtDate, passwordHash, tags, utmParams },
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
      }

      eventPublisher.publishUrlCreated(sanitizeForEvent(newUrl));

      if (publishPreviewJob) {
        publishPreviewJob({ urlId: newUrl.id, originalUrl });
      }

      const slug = newUrl.customAlias || newUrl.shortId;
      res.json({ shortUrl: `${baseUrl}/${slug}` });
    } catch (error) {
      logger.error('Error shortening URL', { error: error.message });
      res.status(500).json({ error: 'Failed to shorten URL' });
    }
  };

  const createUrlsBulk = async (req, res) => {
    const { id: userId } = req.user;
    const { urls } = req.body;

    if (!Array.isArray(urls)) {
      return res.status(400).json({ error: 'urls must be an array.' });
    }

    if (urls.length === 0) {
      return res.status(400).json({ error: 'urls array must not be empty.' });
    }

    if (urls.length > BULK_MAX_ITEMS) {
      return res.status(400).json({ error: `Bulk create is limited to ${BULK_MAX_ITEMS} URLs per request.` });
    }

    const results = await Promise.all(
      urls.map(async (item) => {
        const {
          originalUrl,
          redirectType = 302,
          customAlias,
          expiresAt,
          password,
          tags = [],
          utmParams,
        } = item || {};

        // Per-item validation
        if (!originalUrl) return { error: 'originalUrl is required.' };
        if (!isValidUrl(originalUrl)) return { error: 'Invalid URL. Must be a valid HTTP or HTTPS URL.' };
        if (!VALID_REDIRECT_TYPES.includes(redirectType)) return { error: 'redirectType must be 301 or 302.' };

        if (customAlias !== undefined) {
          const aliasError = validateAlias(customAlias);
          if (aliasError) return { error: aliasError };
        }

        let expiresAtDate;
        if (expiresAt !== undefined) {
          const result = parseExpiresAt(expiresAt);
          if (result.error) return { error: result.error };
          expiresAtDate = result.date;
        }

        if (!Array.isArray(tags) || tags.some((t) => typeof t !== 'string')) {
          return { error: 'tags must be an array of strings.' };
        }

        if (utmParams !== undefined) {
          const utmError = validateUtmParams(utmParams);
          if (utmError) return { error: utmError };
        }

        let passwordHash;
        if (password !== undefined) {
          passwordHash = await bcrypt.hash(password, 10);
        }

        try {
          let newUrl;

          if (customAlias) {
            try {
              newUrl = await prisma.uRL.create({
                data: { originalUrl, shortId: generateShortId(), customAlias, userId, redirectType, expiresAt: expiresAtDate, passwordHash, tags, utmParams },
              });
            } catch (err) {
              if (err.code === 'P2002') return { error: 'Custom alias is already taken.' };
              throw err;
            }
          } else {
            for (let attempt = 0; attempt < MAX_SHORTID_RETRIES; attempt++) {
              try {
                newUrl = await prisma.uRL.create({
                  data: { originalUrl, shortId: generateShortId(), userId, redirectType, expiresAt: expiresAtDate, passwordHash, tags, utmParams },
                });
                break;
              } catch (err) {
                if (err.code === 'P2002' && attempt < MAX_SHORTID_RETRIES - 1) continue;
                throw err;
              }
            }
          }

          eventPublisher.publishUrlCreated(sanitizeForEvent(newUrl));
          if (publishPreviewJob) publishPreviewJob({ urlId: newUrl.id, originalUrl });

          const slug = newUrl.customAlias || newUrl.shortId;
          return { shortUrl: `${baseUrl}/${slug}` };
        } catch (err) {
          logger.error('Bulk create item error', { error: err.message, originalUrl });
          return { error: 'Failed to shorten URL' };
        }
      })
    );

    res.json({ results });
  };

  const updateUrl = async (req, res) => {
    const {
      user: { id: userId },
      params: { id },
      body: { originalUrl, redirectType, customAlias, expiresAt, password, tags, utmParams },
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

    if (customAlias !== undefined && customAlias !== null) {
      const aliasError = validateAlias(customAlias);
      if (aliasError) return validationError(res, aliasError);
    }

    let expiresAtDate;
    if (expiresAt !== undefined) {
      const result = parseExpiresAt(expiresAt);
      if (result.error) return validationError(res, result.error);
      expiresAtDate = result.date;
    }

    if (tags !== undefined && (!Array.isArray(tags) || tags.some((t) => typeof t !== 'string'))) {
      return validationError(res, 'tags must be an array of strings.');
    }

    if (utmParams !== undefined) {
      const utmError = validateUtmParams(utmParams);
      if (utmError) return validationError(res, utmError);
    }

    const data = { originalUrl };
    if (redirectType !== undefined) data.redirectType = redirectType;
    if (customAlias !== undefined) data.customAlias = customAlias;
    if (expiresAt !== undefined) data.expiresAt = expiresAtDate;
    if (tags !== undefined) data.tags = tags;
    if (password !== undefined) {
      data.passwordHash = password === null ? null : await bcrypt.hash(password, 10);
    }
    if (utmParams !== undefined) data.utmParams = utmParams;

    try {
      const updatedUrl = await prisma.uRL.update({ where: { userId, id: urlId }, data });
      eventPublisher.publishUrlUpdated(sanitizeForEvent(updatedUrl));
      res.json(updatedUrl);
    } catch (error) {
      if (error.code === 'P2002') {
        return res.status(409).json({ error: 'Custom alias is already taken.' });
      }
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
      eventPublisher.publishUrlDeleted(sanitizeForEvent(deletedUrl));
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
    createUrlsBulk,
    updateUrl,
    deleteUrl,
  };
};

module.exports = { createUrlsController };
