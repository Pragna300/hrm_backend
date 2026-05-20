const { ok, fail, asyncHandler } = require('../utils/response');
const {
  listEmployees,
  createEmployee,
  updateEmployee,
  deactivateEmployee,
  getEmployeeById,
  updateEmployeeRole,
} = require('../services/employees');
const {
  createEmployeeSchema,
  updateEmployeeSchema,
} = require('../validators/employeeSchemas');
const notificationSvc = require('../services/notifications');

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

  const approvers = await notificationSvc.findUsersByRoles(req.organizationId, ['manager', 'hr']);
  await notificationSvc.createNotificationsForUsers({
    userIds: approvers.map((u) => u.id),
    organizationId: req.organizationId,
    title: 'New Employee Added',
    body: `A new employee (${employee.firstName} ${employee.lastName}) was added to your organization.`,
    type: 'employee',
    link: '/company/employees',
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

const get = asyncHandler(async (req, res) => {
  const employeeId = Number(req.params.id);
  if (!Number.isFinite(employeeId)) return fail(res, 'Invalid employee id', 400);
  const employee = await getEmployeeById({
    organizationId: req.organizationId,
    employeeId,
  });
  return ok(res, { data: employee });
});

const updateRole = asyncHandler(async (req, res) => {
  const employeeId = Number(req.params.id);
  if (!Number.isFinite(employeeId)) return fail(res, 'Invalid employee id', 400);

  const { role } = req.body;
  if (!role) return fail(res, 'Role is required', 400);

  const validRoles = [
    'Intern',
    'Junior Developer',
    'Software Engineer',
    'Senior Software Engineer',
    'Team Lead',
    'HR',
  ];
  if (!validRoles.includes(role)) {
    return fail(res, 'Invalid role value', 400);
  }

  const employee = await updateEmployeeRole({
    organizationId: req.organizationId,
    employeeId,
    role,
    updatedBy: req.user.name || req.user.email,
  });

  return ok(res, { success: true, data: employee, message: 'Employee role updated successfully' });
});

module.exports = { list, create, update, remove, get, updateRole };

