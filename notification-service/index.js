require('dotenv').config();

const { connectRabbitMQ } = require('shared/utils/rabbitmq');
const { createLogger } = require('shared/utils/logger');
const { healthHandler, createReadinessHandler } = require('shared/utils/healthCheck');
const { consumeEmailNotifications } = require('shared/events');
const { createApp } = require('./app');
const { createTransporter, createEmailSender } = require('./services/email.service');

const logger = createLogger('notification-service');

const transporter = createTransporter();
const sendEmail = createEmailSender(transporter);

let rabbitChannel = null;

connectRabbitMQ().then(async (channel) => {
  rabbitChannel = channel;
  await consumeEmailNotifications(channel, sendEmail, { serviceName: 'notification-service' });

  const app = createApp();

  // Health check endpoints (need access to rabbitChannel and transporter)
  app.get('/health', healthHandler);
  app.get('/ready', createReadinessHandler({
    rabbitmq: async () => { if (!rabbitChannel) throw new Error('RabbitMQ not connected'); },
    smtp: async () => { await transporter.verify(); },
  }));

  const server = app.listen(process.env.PORT || 7000, () => {
    logger.info(`Notification service running on port ${process.env.PORT || 7000}`);
  });

  process.on('SIGTERM', gracefulShutdown(server));
  process.on('SIGINT', gracefulShutdown(server));
}).catch(error => {
  logger.error('Error connecting to RabbitMQ', { error: error.message });
  process.exit(1);
});

const gracefulShutdown = server => () => {
  logger.info('Shutting down gracefully...');

  server.close(() => {
    logger.info('Server closed.');

    process.exit(0);
  });

  // Force close the server after 5 seconds
  setTimeout(() => {
    logger.error('Could not close connections in time, forcefully shutting down');
    process.exit(1);
  }, 5000);
};
