require('dotenv').config();
const { PrismaClient } = require('@prisma/client');

const { connectRabbitMQ } = require('shared/utils/rabbitmq');
const { createLogger } = require('shared/utils/logger');
const { healthHandler, createReadinessHandler } = require('shared/utils/healthCheck');
const { createEventPublisher, QUEUES } = require('shared/events');
const { createPreviewClient } = require('./services/preview.client');
const { createApp } = require('./app');

const logger = createLogger('url-service');
const prisma = new PrismaClient();

const port = process.env.PORT || 5000;
const baseUrl = process.env.BASE_URL || `http://localhost:${port}`;

let rabbitChannel = null;

connectRabbitMQ().then((channel) => {
  rabbitChannel = channel;
  channel.assertQueue(QUEUES.EVENTS);

  const eventPublisher = createEventPublisher(channel);
  const previewClient = process.env.PREVIEW_SERVICE_URL
    ? createPreviewClient(process.env.PREVIEW_SERVICE_URL)
    : null;
  const app = createApp({ prisma, eventPublisher, baseUrl, previewClient });

  // Health check endpoints (need access to rabbitChannel)
  app.get('/health', healthHandler);
  app.get('/ready', createReadinessHandler({
    database: async () => { await prisma.$queryRaw`SELECT 1`; },
    rabbitmq: async () => { if (!rabbitChannel) throw new Error('RabbitMQ not connected'); },
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
};
