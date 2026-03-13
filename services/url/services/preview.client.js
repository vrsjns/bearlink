const axios = require('axios');

/**
 * Create a preview service HTTP client
 * @param {string} baseUrl - Base URL of the preview service
 * @returns {Object} Preview client
 */
const createPreviewClient = (baseUrl) => ({
  async fetchPreview(url) {
    const res = await axios.get(`${baseUrl}/preview`, {
      params: { url },
      timeout: 5000,
    });
    return res.data; // { title, description, image, favicon }
  },
});

module.exports = { createPreviewClient };
