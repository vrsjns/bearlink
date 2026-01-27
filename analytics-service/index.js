require('dotenv').config();
const express = require('express');
const morgan = require('morgan');
const { PrismaClient } = require('@prisma/client');
const { connectRabbitMQ } = require('shared/utils/rabbitmq');
const logger = require('shared/utils/logger');
const { corsMiddleware } = require('shared/middlewares/cors');
const { apiLimiter } = require('shared/middlewares/rateLimit');
const { healthHandler, createReadinessHandler } = require('shared/utils/healthCheck');
const { consumeEvents } = require('shared/events');

const prisma = new PrismaClient();
const app = express();
app.use(corsMiddleware);
app.use(express.json());
app.use(morgan('tiny'));

// Health check endpoint
app.get('/health', healthHandler);

const handleEvent = async (type, payload) => {
  try {
    await prisma.event.create({
      data: { type, payload },
    });
    logger.info(`Event of type ${type} stored successfully`);
  } catch (error) {
    logger.error(`Failed to store event of type ${type}:`, error);
  }
};

let rabbitChannel = null;

connectRabbitMQ().then(async (channel) => {
  rabbitChannel = channel;
  await consumeEvents(channel, handleEvent);

  app.get('/events', apiLimiter, async (req, res) => {
    try {
      const events = await prisma.event.findMany();
      res.json(events);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch events' });
    }
  });

  // Readiness check with database and RabbitMQ verification
  app.get('/ready', createReadinessHandler({
    database: async () => { await prisma.$queryRaw`SELECT 1`; },
    rabbitmq: async () => { if (!rabbitChannel) throw new Error('RabbitMQ not connected'); },
  }));

  const server = app.listen(process.env.PORT || 6000, () => {
    logger.info(`Analytics service running on port ${process.env.PORT || 6000}`);
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
