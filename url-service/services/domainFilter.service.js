const { createLogger } = require('shared/utils/logger');

const logger = createLogger('url-service');

/**
 * Parse a comma-separated domain list from an env var string.
 * @param {string|undefined} envValue
 * @returns {string[]} lowercase domain names
 */
const parseDomainList = (envValue) => {
  if (!envValue) return [];
  return envValue
    .split(',')
    .map((d) => d.trim().toLowerCase())
    .filter(Boolean);
};

/**
 * Extract hostname from a URL string.
 * @param {string} urlString
 * @returns {string|null}
 */
const getHostname = (urlString) => {
  try {
    return new URL(urlString).hostname.toLowerCase();
  } catch {
    return null;
  }
};

/**
 * Check whether a domain matches an entry in a list.
 * Matches exact hostname or any subdomain (e.g. "evil.com" matches "sub.evil.com").
 */
const matchesDomain = (hostname, entry) =>
  hostname === entry || hostname.endsWith(`.${entry}`);

/**
 * Check if a URL is permitted by the domain allowlist/blocklist configuration.
 *
 * Reads DOMAIN_ALLOWLIST and DOMAIN_BLOCKLIST from process.env (comma-separated).
 * - DOMAIN_ALLOWLIST set → only listed domains (and their subdomains) are allowed.
 * - DOMAIN_BLOCKLIST set → listed domains (and their subdomains) are blocked.
 * - Allowlist takes precedence over blocklist when both are set.
 * - If neither is set → all domains are allowed.
 *
 * @param {string} urlString
 * @returns {{ allowed: boolean, reason?: string }}
 */
const checkDomain = (urlString) => {
  const hostname = getHostname(urlString);
  if (!hostname) return { allowed: false, reason: 'Invalid URL.' };

  const allowlist = parseDomainList(process.env.DOMAIN_ALLOWLIST);
  const blocklist = parseDomainList(process.env.DOMAIN_BLOCKLIST);

  if (allowlist.length > 0) {
    const permitted = allowlist.some((entry) => matchesDomain(hostname, entry));
    if (!permitted) {
      logger.warn('Domain not in allowlist', { hostname });
      return { allowed: false, reason: `Domain '${hostname}' is not in the allowlist.` };
    }
    return { allowed: true };
  }

  if (blocklist.length > 0) {
    const blocked = blocklist.some((entry) => matchesDomain(hostname, entry));
    if (blocked) {
      logger.warn('Domain blocked', { hostname });
      return { allowed: false, reason: `Domain '${hostname}' is blocked.` };
    }
  }

  return { allowed: true };
};

module.exports = { checkDomain };
