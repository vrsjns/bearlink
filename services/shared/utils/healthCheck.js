/**
 * Basic health check handler
 * Returns status: healthy with timestamp
 */
const healthHandler = (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
  });
};

/**
 * Creates a readiness handler that runs async checks
 * @param {Object} checks - Object with named async check functions
 * @returns {Function} - Express handler for readiness endpoint
 *
 * @example
 * const readyHandler = createReadinessHandler({
 *   database: async () => { await prisma.$queryRaw`SELECT 1`; },
 *   rabbitmq: async () => { ... }
 * });
 */
const createReadinessHandler = (checks) => {
  return async (req, res) => {
    const results = {};
    let allHealthy = true;

    for (const [name, checkFn] of Object.entries(checks)) {
      try {
        await checkFn();
        results[name] = 'healthy';
      } catch (error) {
        results[name] = 'unhealthy';
        allHealthy = false;
      }
    }

    const status = allHealthy ? 'ready' : 'not_ready';
    const statusCode = allHealthy ? 200 : 503;

    res.status(statusCode).json({
      status,
      timestamp: new Date().toISOString(),
      checks: results,
    });
  };
};

module.exports = {
  healthHandler,
  createReadinessHandler,
};
