const nodemailer = require('nodemailer');
const { createLogger } = require('shared/utils/logger');

const logger = createLogger('notification-service');

/**
 * Create nodemailer transporter with SMTP configuration
 * @returns {Object} Nodemailer transporter
 */
const createTransporter = () => {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: process.env.SMTP_PORT,
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });
};

/**
 * Create email sender function with transporter
 * @param {Object} transporter - Nodemailer transporter
 * @returns {Function} Email sender function
 */
const createEmailSender = (transporter) => {
  return async ({ to, subject, text }) => {
    try {
      await transporter.sendMail({
        from: process.env.EMAIL_USER,
        to,
        subject,
        text,
      });
      logger.info('Email sent', { subject, to });
    } catch (error) {
      logger.error('Error sending email', { error: error.message, to, subject });
      throw error;
    }
  };
};

module.exports = {
  createTransporter,
  createEmailSender,
};
