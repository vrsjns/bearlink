const axios = require('axios');
const { createLogger } = require('shared/utils/logger');

const logger = createLogger('url-service');

const SAFE_BROWSING_API = 'https://safebrowsing.googleapis.com/v4/threatMatches:find';
const THREAT_TYPES = [
  'MALWARE',
  'SOCIAL_ENGINEERING',
  'UNWANTED_SOFTWARE',
  'POTENTIALLY_HARMFUL_APPLICATION',
];

/**
 * Check a URL against Google Safe Browsing API v4.
 * Returns true if the URL is safe (or if the check cannot be performed).
 * Fail-open: missing API key, timeout, or any error → returns true.
 *
 * @param {string} url - URL to check
 * @param {string} [apiKey] - Google Safe Browsing API key
 * @param {object} [httpClient] - axios-compatible client (injectable for testing)
 * @returns {Promise<boolean>} true = safe (or unchecked), false = flagged
 */
const checkUrlSafety = async (url, apiKey, httpClient = axios) => {
  if (!apiKey) return true;

  const body = {
    client: { clientId: 'bearlink', clientVersion: '1.0.0' },
    threatInfo: {
      threatTypes: THREAT_TYPES,
      platformTypes: ['ANY_PLATFORM'],
      threatEntryTypes: ['URL'],
      threatEntries: [{ url }],
    },
  };

  try {
    const response = await httpClient.post(`${SAFE_BROWSING_API}?key=${apiKey}`, body, {
      timeout: 3000,
    });
    const matches = response.data?.matches;
    if (matches && matches.length > 0) {
      logger.warn('URL flagged by Safe Browsing API', { url, matchCount: matches.length });
      return false;
    }
    return true;
  } catch (err) {
    logger.warn('Safe Browsing API check failed, allowing URL', { error: err.message });
    return true; // Fail-open
  }
};

module.exports = { checkUrlSafety };
