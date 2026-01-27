require('dotenv').config();
const express = require('express');
const morgan = require('morgan');
const nodemailer = require('nodemailer');
const { connectRabbitMQ } = require('shared/utils/rabbitmq');
const logger = require('shared/utils/logger');
const { corsMiddleware } = require('shared/middlewares/cors');
const { healthHandler, createReadinessHandler } = require('shared/utils/healthCheck');

const RETRY_INTERVAL = 5000;

const app = express();
app.use(corsMiddleware);
app.use(express.json());
app.use(morgan('tiny'));

const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: process.env.SMTP_PORT,
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
    },
});

// Health check endpoint
app.get('/health', healthHandler);

const sendEmail = async ({ to, subject, text }) => {
    try {
        await transporter.sendMail({
            from: process.env.EMAIL_USER,
            to,
            subject,
            text,
        });
        logger.info(`Email ${subject} sent to ${to}`);
    } catch (error) {
        logger.error('Error sending email:', { error: error.message });
        throw (error);
    }
};

const consuemEmailNotifications = (channel) => {
    try {
        channel.assertQueue('email_notifications');
        channel.consume('email_notifications', async (msg) => {
            try {
                const emailContent = JSON.parse(msg.content.toString());
                await sendEmail(emailContent);
                channel.ack(msg);
            } catch (error) {
                logger.error(`Failed to send email:`, { error: error.message });
                channel.nack(msg);
            }
        });
    } catch (error) {
        logger.error('Failed to consume eamil_notification:', error.message);
        setTimeout(consuemEmailNotifications, RETRY_INTERVAL);
    }
};

let rabbitChannel = null;

connectRabbitMQ().then((channel) => {
    rabbitChannel = channel;
    consuemEmailNotifications(channel);

    // Readiness check with RabbitMQ and SMTP verification
    app.get('/ready', createReadinessHandler({
        rabbitmq: async () => { if (!rabbitChannel) throw new Error('RabbitMQ not connected'); },
        smtp: async () => { await transporter.verify(); },
    }));

    const server = app.listen(process.env.PORT || 7000, () => {
        logger.info(`Notification service running on port ${process.env.PORT || 7000}`);
    });

    process.on('SIGTERM', gracefulShutdown(server));
    process.on('SIGINT', gracefulShutdown(server));
});

const gracefulShutdown = server => () => {
    logger.info('Shutting down gracefully...');

    server.close(() => {
        logger.info('Server closed.');

        // Close any other connections or resources here

        process.exit(0);
    });

    // Force close the server after 5 seconds
    setTimeout(() => {
        logger.error('Could not close connections in time, forcefully shutting down');
        process.exit(1);
    }, 5000);
}
