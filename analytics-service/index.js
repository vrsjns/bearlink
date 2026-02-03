require('dotenv').config();
const { PrismaClient } = require('@prisma/client');

const { connectRabbitMQ } = require('shared/utils/rabbitmq');
const { createLogger } = require('shared/utils/logger');
const { healthHandler, createReadinessHandler } = require('shared/utils/healthCheck');
const { consumeEvents } = require('shared/events');
const { createApp } = require('./app');
const { createEventHandler } = require('./services/event.service');

const logger = createLogger('analytics-service');
const prisma = new PrismaClient();

let rabbitChannel = null;

connectRabbitMQ().then(async (channel) => {
  rabbitChannel = channel;

  const handleEvent = createEventHandler({ prisma });
  await consumeEvents(channel, handleEvent, { serviceName: 'analytics-service' });

  const app = createApp({ prisma });

  // Health check endpoints (need access to rabbitChannel)
  app.get('/health', healthHandler);
  app.get('/ready', createReadinessHandler({
    database: async () => { await prisma.$queryRaw`SELECT 1`; },
    rabbitmq: async () => { if (!rabbitChannel) throw new Error('RabbitMQ not connected'); },
  }));

  const server = app.listen(process.env.PORT || 6000, () => {
    logger.info(`Analytics service running on port ${process.env.PORT || 6000}`);
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
