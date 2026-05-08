const ROLE_GROUPS = {
  superAdmin: ['super_admin'],
  companyAdmin: ['manager', 'hr'],
  managerOnly: ['manager'],
  staffApprover: ['manager', 'hr', 'team_lead'],
  anyEmployee: ['manager', 'hr', 'team_lead', 'employee'],
};

/**
 * Restrict a route to one or more roles.
 * Pass either an array of roles or a key from ROLE_GROUPS.
 */
function rbac(allowed) {
  const roles = Array.isArray(allowed)
    ? allowed
    : ROLE_GROUPS[allowed] || [allowed];

  return (req, res, next) => {
    if (!req.user?.role) {
      return res.status(401).json({ success: false, message: 'Unauthenticated' });
    }
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }
    return next();
  };
}

module.exports = { rbac, ROLE_GROUPS };
