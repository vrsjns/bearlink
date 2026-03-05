const express = require('express');
const crypto = require('crypto');
const { authenticateJWT, isAdmin } = require('shared/middlewares/auth');
const { ingestAuditEvents, queryAuditLog } = require('../controllers/audit.controller');

const requireAuditSecret = (req, res, next) => {
  const secret = process.env.AUDIT_INTERNAL_SECRET;
  const header = req.headers['x-audit-secret'];

  if (!header || !secret) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  let authorized = false;
  try {
    const a = Buffer.from(header);
    const b = Buffer.from(secret);
    if (a.length === b.length) {
      authorized = crypto.timingSafeEqual(a, b);
    }
  } catch {
    authorized = false;
  }

  if (!authorized) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  return next();
};

const createAuditRoutes = ({ prisma }) => {
  const router = express.Router();

  router.post('/internal/audit-events', requireAuditSecret, ingestAuditEvents({ prisma }));

  router.get('/audit', authenticateJWT, isAdmin, queryAuditLog({ prisma }));

  return router;
};

module.exports = { createAuditRoutes };
