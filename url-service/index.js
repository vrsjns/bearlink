require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const Redis = require('ioredis');

const { connectRabbitMQ } = require('shared/utils/rabbitmq');
const { createLogger } = require('shared/utils/logger');
const { healthHandler, createReadinessHandler } = require('shared/utils/healthCheck');
const { createEventPublisher, QUEUES } = require('shared/events');
const { createApp } = require('./app');

const logger = createLogger('url-service');
const prisma = new PrismaClient();

const port = process.env.PORT || 5000;
const baseUrl = process.env.BASE_URL || `http://localhost:${port}`;

// Redis client — connection errors are logged but don't crash the service
const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
  lazyConnect: true,
  enableOfflineQueue: false,
  maxRetriesPerRequest: 1,
});

redis.on('connect', () => logger.info('Connected to Redis'));
redis.on('error', (err) => logger.error('Redis error', { error: err.message }));

redis.connect().catch((err) => {
  logger.warn('Could not connect to Redis at startup, continuing without cache', { error: err.message });
});

let rabbitChannel = null;

connectRabbitMQ().then((channel) => {
  rabbitChannel = channel;
  channel.assertQueue(QUEUES.EVENTS, { durable: true });
  channel.assertQueue(QUEUES.PREVIEW_JOBS, { durable: true });
  channel.assertQueue(QUEUES.PREVIEW_RESULTS, { durable: true });

  const eventPublisher = createEventPublisher(channel);

  const publishPreviewJob = ({ urlId, originalUrl }) => {
    channel.sendToQueue(
      QUEUES.PREVIEW_JOBS,
      Buffer.from(JSON.stringify({ urlId, originalUrl })),
      { persistent: true },
    );
  };

  // Consume preview results and write metadata back to the URL record
  channel.consume(QUEUES.PREVIEW_RESULTS, async (msg) => {
    if (!msg) return;
    try {
      const { urlId, title, description, image } = JSON.parse(msg.content.toString());
      await prisma.uRL.update({
        where: { id: urlId },
        data: {
          previewTitle: title,
          previewDescription: description,
          previewImageUrl: image,
          previewFetchedAt: new Date(),
        },
      });
      channel.ack(msg);
      logger.info('Preview metadata saved', { urlId });
    } catch (err) {
      logger.error('Failed to save preview result', { error: err.message });
      channel.nack(msg, false, false);
    }
  });

  const app = createApp({ prisma, eventPublisher, baseUrl, publishPreviewJob, redis });

  app.get('/health', healthHandler);
  app.get('/ready', createReadinessHandler({
    database: async () => { await prisma.$queryRaw`SELECT 1`; },
    rabbitmq: async () => { if (!rabbitChannel) throw new Error('RabbitMQ not connected'); },
    redis: async () => { await redis.ping(); },
  }));

  const server = app.listen(port, () => {
    logger.info(`URL service running on port ${port}`);
  });

  process.on('SIGTERM', gracefulShutdown(server));
  process.on('SIGINT', gracefulShutdown(server));
}).catch(error => {
  logger.error('Error connecting to RabbitMQ', { error: error.message });
  process.exit(1);
});

const gracefulShutdown = server => async () => {
  logger.info('Shutting down gracefully...');

  server.close(async () => {
    logger.info('Server closed.');
    await prisma.$disconnect();
    logger.info('Prisma disconnected.');
    redis.disconnect();
    logger.info('Redis disconnected.');
    process.exit(0);
  });

  setTimeout(() => {
    logger.error('Could not close connections in time, forcefully shutting down');
    process.exit(1);
  }, 5000);
};
