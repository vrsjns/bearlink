const bcrypt = require('bcryptjs');
const geoip = require('geoip-lite');
const QRCode = require('qrcode');
const { createLogger } = require('shared/utils/logger');
const { isSafeRedirectUrl } = require('shared/utils/validation');
const { verifyUrl, SIG_PARAM, EXP_PARAM } = require('../services/signedUrl.service');

const logger = createLogger('url-service');

const URL_CACHE_TTL = 60; // seconds

// Known bot / crawler user-agent patterns — still redirect, but don't count clicks
const BOT_PATTERN =
  /bot|crawl|spider|slurp|google|bingbot|duckduck|baidu|yandex|slackbot|twitterbot|facebookexternalhit|linkedinbot|whatsapp|telegram|curl|wget|python-requests|go-http-client/i;

const isBot = (ua) => !ua || BOT_PATTERN.test(ua);

/**
 * Extract click metadata from the request for analytics.
 */
const extractClickMetadata = (req) => {
  const userAgent = req.headers['user-agent'] || null;
  const referer = req.headers['referer'] || req.headers['referrer'] || null;
  const ip =
    (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.ip || '';
  const geo = geoip.lookup(ip);
  const country = geo?.country || null;
  return { userAgent, referer, country, ip };
};

/**
 * Look up a URL by shortId OR customAlias, with optional Redis caching.
 */
const findUrl = async (prisma, redis, slug) => {
  if (redis) {
    try {
      const cached = await redis.get(`url:${slug}`);
      if (cached) {
        const parsed = JSON.parse(cached);
        // Rehydrate Date fields
        if (parsed.expiresAt) parsed.expiresAt = new Date(parsed.expiresAt);
        if (parsed.createdAt) parsed.createdAt = new Date(parsed.createdAt);
        if (parsed.previewFetchedAt) parsed.previewFetchedAt = new Date(parsed.previewFetchedAt);
        return parsed;
      }
    } catch (err) {
      logger.warn('Redis get error, falling back to DB', { error: err.message });
    }
  }

  const url = await prisma.uRL.findFirst({
    where: { OR: [{ shortId: slug }, { customAlias: slug }] },
  });

  if (url && redis) {
    try {
      await redis.setex(`url:${slug}`, URL_CACHE_TTL, JSON.stringify(url));
    } catch (err) {
      logger.warn('Redis setex error', { error: err.message });
    }
  }

  return url;
};

/**
 * Invalidate cache entries for a URL record.
 */
const invalidateUrlCache = async (redis, url) => {
  if (!redis || !url) return;
  try {
    const keys = [`url:${url.shortId}`];
    if (url.customAlias) keys.push(`url:${url.customAlias}`);
    await redis.del(...keys);
  } catch (err) {
    logger.warn('Redis del error during cache invalidation', { error: err.message });
  }
};

/**
 * Check and record click deduplication using Redis.
 * Returns true if this is a unique click (should be counted), false if duplicate.
 */
const isUniqueClick = async (redis, shortId, ip) => {
  if (!redis) return true; // No Redis → count all clicks

  const hour = Math.floor(Date.now() / 3_600_000);
  const key = `dedup:${shortId}:${ip}:${hour}`;
  try {
    const result = await redis.set(key, '1', 'EX', 3600, 'NX');
    return result === 'OK'; // OK = newly set = unique; null = already existed = duplicate
  } catch (err) {
    logger.warn('Redis dedup error, counting click', { error: err.message });
    return true; // Fail open: count click if Redis is down
  }
};

/**
 * Append UTM params to a destination URL if any are set.
 */
const buildRedirectUrl = (originalUrl, utmParams) => {
  if (!utmParams || typeof utmParams !== 'object' || Array.isArray(utmParams)) {
    return originalUrl;
  }
  const entries = Object.entries(utmParams).filter(
    ([, v]) => v !== null && v !== undefined && v !== ''
  );
  if (entries.length === 0) return originalUrl;

  const dest = new URL(originalUrl);
  for (const [key, value] of entries) {
    dest.searchParams.set(key, String(value));
  }
  return dest.toString();
};

/**
 * Minimal HTML entity escaping to prevent XSS in the preview page.
 */
const escapeHtml = (str) =>
  String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

/**
 * Build a simple HTML bounce page for ?preview=1 requests.
 */
const buildPreviewPage = (url, slug, destination) => {
  const title = url.previewTitle ? escapeHtml(url.previewTitle) : escapeHtml(destination);
  const description = url.previewDescription ? escapeHtml(url.previewDescription) : '';
  const image = url.previewImageUrl ? escapeHtml(url.previewImageUrl) : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Link Preview</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 600px; margin: 60px auto; padding: 0 16px; color: #222; }
    .card { border: 1px solid #ddd; border-radius: 8px; overflow: hidden; }
    .card img { width: 100%; max-height: 300px; object-fit: cover; }
    .card-body { padding: 16px; }
    .card-body h2 { margin: 0 0 8px; font-size: 1.2rem; }
    .card-body p { margin: 0 0 16px; color: #555; font-size: 0.9rem; }
    .url { font-size: 0.8rem; color: #888; word-break: break-all; margin-bottom: 16px; }
    a.btn { display: inline-block; background: #0070f3; color: #fff; padding: 10px 20px;
            border-radius: 6px; text-decoration: none; font-weight: 600; }
    a.btn:hover { background: #0051a2; }
  </style>
</head>
<body>
  <div class="card">
    ${image ? `<img src="${image}" alt="Preview image">` : ''}
    <div class="card-body">
      <h2>${title}</h2>
      ${description ? `<p>${description}</p>` : ''}
      <div class="url">${escapeHtml(destination)}</div>
      <a class="btn" href="${escapeHtml(destination)}">Continue to site &rarr;</a>
    </div>
  </div>
</body>
</html>`;
};

/**
 * Create redirect controller with dependencies
 * @param {Object} deps
 * @param {Object} deps.prisma - Prisma client
 * @param {Object} deps.eventPublisher - Event publisher
 * @param {string} deps.baseUrl - Base URL for short links
 * @param {import('ioredis').Redis} [deps.redis] - Optional Redis client
 * @returns {Object} Controller methods
 */
const createRedirectController = ({ prisma, eventPublisher, baseUrl, redis }) => {
  const qr = async (req, res) => {
    const { shortId } = req.params;

    try {
      const url = await findUrl(prisma, redis, shortId);

      if (!url) {
        return res.status(404).json({ error: 'URL not found' });
      }

      if (url.expiresAt && url.expiresAt < new Date()) {
        return res.status(410).json({ error: 'This link has expired.' });
      }

      const slug = url.customAlias || url.shortId;
      const shortUrl = `${baseUrl}/${slug}`;
      const buffer = await QRCode.toBuffer(shortUrl);

      res.type('image/png').send(buffer);
    } catch (error) {
      logger.error('Error generating QR code', { error: error.message });
      res.status(500).json({ error: 'Failed to generate QR code' });
    }
  };

  const redirect = async (req, res) => {
    const { shortId } = req.params;

    try {
      const url = await findUrl(prisma, redis, shortId);

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

      if (url.requireSignature) {
        const secret = process.env.URL_SIGNING_SECRET;
        if (!secret) {
          logger.warn('requireSignature set but URL_SIGNING_SECRET not configured', { shortId });
          return res.status(403).json({ error: 'This link requires a valid signature.' });
        }
        const slug = url.customAlias || url.shortId;
        const baseShortUrl = `${baseUrl}/${slug}`;
        const result = verifyUrl(baseShortUrl, req.query[SIG_PARAM], req.query[EXP_PARAM], secret);
        if (!result.valid) {
          return res.status(403).json({ error: result.reason || 'Invalid or expired signature.' });
        }
      }

      const destination = buildRedirectUrl(url.originalUrl, url.utmParams);

      if (req.query.preview === '1') {
        const slug = url.customAlias || url.shortId;
        return res.status(200).type('html').send(buildPreviewPage(url, slug, destination));
      }

      const { userAgent, referer, country, ip } = extractClickMetadata(req);

      if (!isBot(userAgent)) {
        const unique = await isUniqueClick(redis, url.shortId, ip);

        if (unique) {
          await prisma.uRL.update({
            where: { shortId: url.shortId },
            data: { clicks: { increment: 1 } },
          });

          eventPublisher.publishUrlClicked({
            shortId: url.shortId,
            originalUrl: url.originalUrl,
            referer,
            userAgent,
            country,
          });
        } else {
          logger.info('Duplicate click — not counted', { shortId: url.shortId, ip });
        }
      } else {
        logger.info('Bot redirect — click not counted', { userAgent, shortId: url.shortId });
      }

      res.redirect(url.redirectType, destination);
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
      const url = await findUrl(prisma, redis, shortId);

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

      const destination = buildRedirectUrl(url.originalUrl, url.utmParams);

      const { userAgent, referer, country } = extractClickMetadata(req);

      await prisma.uRL.update({
        where: { shortId: url.shortId },
        data: { clicks: { increment: 1 } },
      });

      eventPublisher.publishUrlClicked({
        shortId: url.shortId,
        originalUrl: url.originalUrl,
        referer,
        userAgent,
        country,
      });

      res.redirect(url.redirectType, destination);
    } catch (error) {
      logger.error('Error unlocking URL', { error: error.message });
      res.status(500).json({ error: 'Failed to unlock' });
    }
  };

  return { qr, redirect, unlock };
};

module.exports = { createRedirectController, invalidateUrlCache };
