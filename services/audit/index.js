require('dotenv').config();
const { PrismaClient } = require('@prisma/client');

const { createLogger } = require('shared/utils/logger');
const { healthHandler, createReadinessHandler } = require('shared/utils/healthCheck');
const { createApp } = require('./app');

const logger = createLogger('audit-service');
const prisma = new PrismaClient();

const app = createApp({ prisma });

app.get('/health', healthHandler);
app.get(
  '/ready',
  createReadinessHandler({
    database: async () => {
      await prisma.$queryRaw`SELECT 1`;
    },
  })
);

const port = process.env.PORT || 8500;
const server = app.listen(port, () => {
  logger.info(`Audit service running on port ${port}`);
});

const gracefulShutdown = async () => {
  logger.info('Shutting down gracefully...');

  server.close(async () => {
    logger.info('Server closed.');

    await prisma.$disconnect();
    logger.info('Prisma disconnected.');

    process.exit(0);
  });

  setTimeout(() => {
    logger.error('Could not close connections in time, forcefully shutting down');
    process.exit(1);
  }, 5000);
};

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);
