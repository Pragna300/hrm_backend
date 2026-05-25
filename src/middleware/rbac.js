const ROLE_GROUPS = {
  superAdmin: ['super_admin'],
  manager: ['manager', 'super_admin'],
  hr: ['manager', 'hr', 'super_admin'],
  teamLead: ['manager', 'hr', 'team_lead', 'super_admin'],
  employee: ['manager', 'hr', 'team_lead', 'employee', 'super_admin'],
  anyEmployee: ['manager', 'hr', 'team_lead', 'employee'],
  canEditProfile: ['manager', 'hr', 'team_lead'],
  companyAdmin: ['manager', 'hr'],
  managerOnly: ['manager'],
  staffApprover: ['manager', 'hr', 'team_lead'],
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

// Role hierarchy levels (higher number = higher authority)
const ROLE_HIERARCHY = {
  platform_super_admin: 5,
  manager: 4,
  hr: 3,
  team_lead: 2,
  employee: 1,
};

// Recruitment permissions per role
const RECRUITMENT_ACCESS = {
  manager: ['hr', 'team_lead', 'employee'],
  hr: ['employee'],
  team_lead: [],
  employee: [],
};

module.exports = { rbac, ROLE_GROUPS, ROLE_HIERARCHY, RECRUITMENT_ACCESS };
