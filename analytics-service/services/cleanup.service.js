const { createLogger } = require('shared/utils/logger');

const logger = createLogger('analytics-service');

/**
 * Delete events older than the retention period.
 * @param {Object} prisma - Prisma client
 * @param {number} retentionDays - Number of days to retain events
 * @returns {Promise<number>} Number of deleted events
 */
const runCleanup = async (prisma, retentionDays) => {
  const cutoff = new Date(Date.now() - retentionDays * 86400_000);
  const { count } = await prisma.event.deleteMany({ where: { createdAt: { lt: cutoff } } });
  logger.info(`Cleanup: deleted ${count} events older than ${retentionDays} days`);
  return count;
};

module.exports = { runCleanup };
