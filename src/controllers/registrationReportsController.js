const { ok, fail, asyncHandler } = require('../utils/response');
const service = require('../services/registrationReports');

// Resolves scope. If user is super_admin, they can request for specific organization or see everything.
// If company admin (manager/hr), they are locked to their req.organizationId.
function getTargetOrgId(req) {
  if (req.user.role === 'super_admin') {
    return req.query.organizationId ? Number(req.query.organizationId) : null;
  }
  return req.organizationId;
}

const getOverview = asyncHandler(async (req, res) => {
  const orgId = getTargetOrgId(req);
  const { granularity, startDate, endDate } = req.query;
  const result = await service.getRegistrationOverview(orgId, { granularity, startDate, endDate });
  return ok(res, { data: result });
});

const getCharts = asyncHandler(async (req, res) => {
  const orgId = getTargetOrgId(req);
  const { granularity, startDate, endDate } = req.query;
  const result = await service.getRegistrationCharts(orgId, { granularity, startDate, endDate });
  return ok(res, { data: result });
});

const getTable = asyncHandler(async (req, res) => {
  const orgId = getTargetOrgId(req);
  const { granularity, startDate, endDate, page, pageSize, search, sortBy, sortOrder } = req.query;
  
  const result = await service.getRegistrationTable(orgId, {
    granularity,
    startDate,
    endDate,
    page: Number(page) || 1,
    pageSize: Number(pageSize) || 10,
    search,
    sortBy,
    sortOrder,
  });
  return ok(res, { data: result });
});

const getFinancials = asyncHandler(async (req, res) => {
  const orgId = getTargetOrgId(req);
  const { startDate, endDate } = req.query;
  const result = await service.getRegistrationFinancials(orgId, { startDate, endDate });
  return ok(res, { data: result });
});

const exportExcel = asyncHandler(async (req, res) => {
  const orgId = getTargetOrgId(req);
  const { granularity, startDate, endDate } = req.query;
  const csv = await service.exportRegistrationData(orgId, { granularity, startDate, endDate });

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="registration-report-${new Date().toISOString().split('T')[0]}.csv"`);
  return res.status(200).send(csv);
});

module.exports = {
  getOverview,
  getCharts,
  getTable,
  getFinancials,
  exportExcel,
};
