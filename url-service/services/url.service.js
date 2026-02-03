const { nanoid } = require('nanoid');

/**
 * Generate a unique short ID for a URL
 * @param {number} length - Length of the short ID (default: 10)
 * @returns {string} Short ID
 */
const generateShortId = (length = 10) => nanoid(length);

module.exports = {
  generateShortId,
};
