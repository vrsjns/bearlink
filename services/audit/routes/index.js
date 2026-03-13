const express = require('express');
const { createAuditRoutes } = require('./audit.routes');

const createRoutes = ({ prisma }) => {
  const router = express.Router();

  router.use(createAuditRoutes({ prisma }));

  return router;
};

module.exports = { createRoutes };
