require('dotenv').config();
const express = require('express');
const { nanoid } = require('nanoid');
const { PrismaClient } = require('@prisma/client');

const { connectRabbitMQ } = require('shared/utils/rabbitmq');
const { createLogger } = require('shared/utils/logger');
const { authenticateJWT } = require('shared/middlewares/auth');
const { corsMiddleware } = require('shared/middlewares/cors');
const { apiLimiter, redirectLimiter } = require('shared/middlewares/rateLimit');
const { isValidUrl, isSafeRedirectUrl, validateRequiredFields, validationError } = require('shared/utils/validation');
const { healthHandler, createReadinessHandler } = require('shared/utils/healthCheck');
const { createEventPublisher, QUEUES } = require('shared/events');
const { createCorrelationIdMiddleware } = require('shared/middlewares/correlationId');
const { createRequestLogger } = require('shared/middlewares/requestLogger');

const logger = createLogger('url-service');
const prisma = new PrismaClient();
const app = express();

app.use(corsMiddleware);
app.use(express.json());
app.use(createCorrelationIdMiddleware('url-service'));
app.use(createRequestLogger('url-service'));

const port = process.env.PORT || 5000;
const baseUrl = process.env.BASE_URL || `http://localhost:${port}`;

// Health check endpoint
app.get('/health', healthHandler);

let rabbitChannel = null;

connectRabbitMQ().then((channel) => {
  rabbitChannel = channel;
  channel.assertQueue(QUEUES.EVENTS);

  const eventPublisher = createEventPublisher(channel);

  app.get('/urls', authenticateJWT, apiLimiter, async (req, res) => {
    const {
      user: {
        id: userId,
      }
    } = req;

    const urls = await prisma.uRL.findMany({ where: { userId } });

    res.json(urls);
  });

  app.post('/urls', authenticateJWT, apiLimiter, async (req, res) => {
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

    const shortId = nanoid(10);

    try {
      const newUrl = await prisma.uRL.create({
        data: { originalUrl, shortId, userId },
      });

      eventPublisher.publishUrlCreated(newUrl);

      res.json({ shortUrl: `${baseUrl}/${shortId}` });
    } catch (error) {
      logger.error('Error shortening URL', { error: error.message });
      res.status(500).json({ error: 'Failed to shorten URL' });
    }
  });

  app.put('/urls/:id', authenticateJWT, apiLimiter, async (req, res) => {
    const {
      user: {
        id: userId
      },
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
  });

  app.delete('/urls/:id', authenticateJWT, apiLimiter, async (req, res) => {
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
  });

  // Redirect to original URL based on short ID. Anybody can access the original URL by visiting the shortened URL.
  app.get('/:shortId', redirectLimiter, async (req, res) => {
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
  });

  // Readiness check with database and RabbitMQ verification
  app.get('/ready', createReadinessHandler({
    database: async () => { await prisma.$queryRaw`SELECT 1`; },
    rabbitmq: async () => { if (!rabbitChannel) throw new Error('RabbitMQ not connected'); },
  }));

  const server = app.listen(port, () => {
    logger.info(`URL service running on port ${port}`);
  });

  process.on('SIGTERM', gracefulShutdown(server));
  process.on('SIGINT', gracefulShutdown(server));
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
