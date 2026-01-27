const amqp = require('amqplib');
const logger = require('./logger');

const QUEUES = {
    EVENT: 'events',
    TASKS: 'tasks',
    STATUS_UPDATE: 'status_update'
};

let channel = null;

const RABBITMQ_URL = process.env.RABBITMQ_URL || 'amqp://localhost';
const RETRY_INTERVAL = 5000; // 5 seconds

const connectRabbitMQ = () => {
    return new Promise(async (resolve, reject) => {
        const retryInterval = 2000; // Retry every 2 seconds
        const maxRetries = 30; // Maximum number of retries
        let attempts = 0;

        const tryToConnect = async () => {
            attempts++;

            try {
                const connection = await amqp.connect(RABBITMQ_URL);
                connection.on('error', handleConnectionError);
                connection.on('close', handleConnectionClose);
                channel = await connection.createChannel();
                logger.info('Connected to RabbitMQ, channel created.');
                resolve(channel);
            } catch (error) {
                logger.error(`Connection attempt ${attempts} failed: ${error.message}`);
                if (attempts < maxRetries) {
                    logger.info(`Retrying in ${retryInterval / 1000} seconds...`);
                    setTimeout(tryToConnect, retryInterval);
                } else {
                    reject(new Error('Failed to connect to RabbitMQ after maximum retries.'));
                }
            }
        };

        await tryToConnect();
    });
};

const handleConnectionError = (error) => {
    logger.error('RabbitMQ connection error:', error.message);
    if (error.message !== 'Connection closing') {
        setTimeout(connectRabbitMQ, RETRY_INTERVAL);
    }
};

const handleConnectionClose = () => {
    logger.error('RabbitMQ connection closed, attempting to reconnect...');
    setTimeout(connectRabbitMQ, RETRY_INTERVAL);
};

const getChannel = () => channel

module.exports = {
    connectRabbitMQ,
    getChannel,
};
