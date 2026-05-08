const { ok, fail, asyncHandler } = require('../utils/response');
const {
  listEmployees,
  createEmployee,
  updateEmployee,
  deactivateEmployee,
} = require('../services/employees');
const {
  createEmployeeSchema,
  updateEmployeeSchema,
} = require('../validators/employeeSchemas');

const list = asyncHandler(async (req, res) => {
  const employees = await listEmployees(req.organizationId);
  return ok(res, { data: employees });
});

const create = asyncHandler(async (req, res) => {
  const parsed = createEmployeeSchema.safeParse(req.body);
  if (!parsed.success) {
    return fail(res, parsed.error.issues[0]?.message || 'Invalid input', 400);
  }
  const { employee, emailResult } = await createEmployee({
    organizationId: req.organizationId,
    body: parsed.data,
  });
  return ok(
    res,
    {
      data: employee,
      emailSent: emailResult.sent,
      message: emailResult.sent
        ? 'Employee created and credential email sent'
        : `Employee created. Email not sent: ${emailResult.reason}`,
    },
    201
  );
});

const update = asyncHandler(async (req, res) => {
  const employeeId = Number(req.params.id);
  if (!Number.isFinite(employeeId)) return fail(res, 'Invalid employee id', 400);

  const parsed = updateEmployeeSchema.safeParse(req.body);
  if (!parsed.success) {
    return fail(res, parsed.error.issues[0]?.message || 'Invalid input', 400);
  }

  const employee = await updateEmployee({
    organizationId: req.organizationId,
    employeeId,
    body: parsed.data,
  });
  return ok(res, { data: employee, message: 'Employee updated' });
});

const remove = asyncHandler(async (req, res) => {
  const employeeId = Number(req.params.id);
  if (!Number.isFinite(employeeId)) return fail(res, 'Invalid employee id', 400);
  const result = await deactivateEmployee({
    organizationId: req.organizationId,
    employeeId,
  });
  return ok(res, { data: result, message: 'Employee deactivated' });
});

module.exports = { list, create, update, remove };
