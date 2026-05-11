const jwt = require('jsonwebtoken');
const { env } = require('../config/env');

/**
 * Verifies an `Authorization: Bearer <jwt>` header and attaches the decoded
 * payload to `req.user` (shape: { userId, role, employeeId, organizationId }).
 */
function verifyJWT(req, res, next) {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!token) {
    return res.status(401).json({ success: false, message: 'No token' });
  }

  try {
    req.user = jwt.verify(token, env.JWT_SECRET);
    return next();
  } catch {
    return res.status(401).json({ success: false, message: 'Invalid or expired token' });
  }
}

module.exports = { verifyJWT };
