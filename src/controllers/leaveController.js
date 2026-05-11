const { ok, fail, asyncHandler } = require('../utils/response');
const svc = require('../services/leaves');

const types = asyncHandler(async (req, res) => {
  const includeInactive = req.user.role === 'manager' || req.user.role === 'hr';
  const data = await svc.listLeaveTypes(req.organizationId, { includeInactive });
  return ok(res, { data });
});

const upsertType = asyncHandler(async (req, res) => {
  const id = req.params.id ? Number(req.params.id) : null;
  const data = await svc.upsertLeaveType({
    organizationId: req.organizationId,
    id,
    body: req.body,
  });
  return ok(res, { data });
});

/** Manager / HR list — every leave in the org, optionally filtered. */
const listAll = asyncHandler(async (req, res) => {
  const status = req.query.status || null;
  const data = await svc.listLeaveRequests({ organizationId: req.organizationId, status });
  return ok(res, { data });
});

/** Self-service list — current employee only. */
const listMine = asyncHandler(async (req, res) => {
  const employeeId = req.user.employeeId;
  if (!employeeId) return fail(res, 'No employee profile linked to this account', 403);
  const data = await svc.listLeaveRequests({
    organizationId: req.organizationId,
    employeeId,
  });
  return ok(res, { data });
});

const myBalances = asyncHandler(async (req, res) => {
  const employeeId = req.user.employeeId;
  if (!employeeId) return fail(res, 'No employee profile linked to this account', 403);
  const data = await svc.getEmployeeBalances(employeeId);
  return ok(res, { data });
});

const createMine = asyncHandler(async (req, res) => {
  const employeeId = req.user.employeeId;
  if (!employeeId) return fail(res, 'No employee profile linked to this account', 403);
  const data = await svc.createLeaveRequest({
    organizationId: req.organizationId,
    employeeId,
    body: req.body,
  });
  return ok(res, { data, message: 'Leave request submitted' }, 201);
});

const decide = asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return fail(res, 'Invalid id', 400);
  const decision = req.body.decision === 'approve' ? 'approve' : 'reject';
  const data = await svc.decideLeaveRequest({
    organizationId: req.organizationId,
    leaveRequestId: id,
    approverEmployeeId: req.user.employeeId || null,
    decision,
    note: req.body.note || null,
  });
  return ok(res, { data, message: `Leave ${data.status}` });
});

const cancelMine = asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return fail(res, 'Invalid id', 400);
  const employeeId = req.user.employeeId;
  if (!employeeId) return fail(res, 'No employee profile linked to this account', 403);
  const data = await svc.cancelLeaveRequest({ employeeId, leaveRequestId: id });
  return ok(res, { data, message: 'Leave request cancelled' });
});

module.exports = { types, upsertType, listAll, listMine, myBalances, createMine, decide, cancelMine };
