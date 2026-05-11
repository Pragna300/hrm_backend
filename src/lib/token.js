const jwt = require('jsonwebtoken');
const { env } = require('../config/env');

/** Signs a session JWT with claims used by the rest of the API. */
function signAuthToken(user) {
  return jwt.sign(
    {
      userId: user.id,
      role: user.role,
      employeeId: user.employee?.id ?? null,
      organizationId: user.organizationId ?? null,
    },
    env.JWT_SECRET,
    { expiresIn: '24h' }
  );
}

module.exports = { signAuthToken };
