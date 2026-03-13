const express = require('express');
const { createAnalyticsRoutes } = require('./analytics.routes');

const createRoutes = ({ prisma }) => {
  const router = express.Router();

  router.use(createAnalyticsRoutes({ prisma }));

  return router;
};

module.exports = { createRoutes };
