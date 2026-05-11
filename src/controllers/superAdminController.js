const { ok, asyncHandler } = require('../utils/response');
const svc = require('../services/platform');

const overview = asyncHandler(async (_req, res) => {
  const data = await svc.getPlatformOverview();
  return ok(res, { data });
});

const companies = asyncHandler(async (_req, res) => {
  const data = await svc.listOrganizations();
  return ok(res, { data });
});

const updateCompanyStatus = asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const data = await svc.setOrganizationStatus({
    organizationId: id,
    status: req.body.status,
  });
  return ok(res, { data, message: `Company ${data.status}` });
});

const deleteCompany = asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const confirmSlug = req.query?.confirmSlug ?? req.body?.confirmSlug;
  await svc.deleteOrganization({ organizationId: id, confirmSlug });
  return ok(res, { message: 'Company and tenant data were deleted permanently.' });
});

const invoices = asyncHandler(async (_req, res) => {
  const data = await svc.listInvoices();
  return ok(res, { data });
});

const plans = asyncHandler(async (_req, res) => {
  const data = await svc.listPlans();
  return ok(res, { data });
});

const upsertPlan = asyncHandler(async (req, res) => {
  const id = req.params.id ? Number(req.params.id) : null;
  const data = await svc.upsertPlan({ id, body: req.body });
  return ok(res, { data });
});

module.exports = {
  overview,
  companies,
  updateCompanyStatus,
  deleteCompany,
  invoices,
  plans,
  upsertPlan,
};
