const crypto = require('crypto');

const generateResetToken = () => crypto.randomBytes(32).toString('hex');

const buildResetLink = (token) => `${process.env.FRONTEND_URL}/reset-password/${token}`;

module.exports = { generateResetToken, buildResetLink };
