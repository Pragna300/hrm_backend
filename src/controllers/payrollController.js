const { ok, fail, asyncHandler } = require('../utils/response');
const svc = require('../services/payroll');

const list = asyncHandler(async (req, res) => {
  const data = await svc.listPayrollRuns(req.organizationId);
  return ok(res, { data });
});

const detail = asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return fail(res, 'Invalid id', 400);
  const data = await svc.getPayrollRun({ organizationId: req.organizationId, runId: id });
  return ok(res, { data });
});

const create = asyncHandler(async (req, res) => {
  const { periodStart, periodEnd } = req.body || {};
  if (!periodStart || !periodEnd) return fail(res, 'periodStart and periodEnd are required');
  const data = await svc.createPayrollRun({
    organizationId: req.organizationId,
    periodStart,
    periodEnd,
  });
  return ok(res, { data, message: 'Payroll run created' }, 201);
});

const updateItem = asyncHandler(async (req, res) => {
  const itemId = Number(req.params.itemId);
  if (!Number.isFinite(itemId)) return fail(res, 'Invalid id', 400);
  const data = await svc.updatePayrollItem({
    organizationId: req.organizationId,
    itemId,
    body: req.body || {},
  });
  return ok(res, { data });
});

const finalize = asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return fail(res, 'Invalid id', 400);
  const data = await svc.finalizePayrollRun({ organizationId: req.organizationId, runId: id });
  return ok(res, { data, message: 'Payroll finalized — payslips emailed' });
});

const myPayslips = asyncHandler(async (req, res) => {
  const employeeId = req.user.employeeId;
  if (!employeeId) return fail(res, 'No employee profile linked to this account', 403);
  const data = await svc.listMyPayslips(employeeId);
  return ok(res, { data });
});

module.exports = { list, detail, create, updateItem, finalize, myPayslips };
