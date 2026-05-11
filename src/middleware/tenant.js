/**
 * Multi-tenant helpers.
 *
 * `requireTenant` ensures the caller is bound to an organization (everyone
 * except super_admin). It stamps `req.organizationId` so downstream code
 * never has to re-read the JWT.
 *
 * `tenantWhere` builds a `where` clause that scopes a Prisma query to the
 * caller's tenant — except for super_admin, who can see everything.
 */
function requireTenant(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ success: false, message: 'Unauthenticated' });
  }
  if (req.user.role === 'super_admin') return next();

  const orgId = req.user.organizationId;
  if (!orgId) {
    return res.status(403).json({
      success: false,
      message: 'Your account is not linked to a company.',
    });
  }
  req.organizationId = orgId;
  return next();
}

function tenantWhere(req, extra = {}) {
  if (req.user?.role === 'super_admin') return extra;
  return { ...extra, organizationId: req.user.organizationId };
}

module.exports = { requireTenant, tenantWhere };
