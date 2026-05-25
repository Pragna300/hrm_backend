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

const {
  RECRUITMENT_ACCESS,
  ROLE_HIERARCHY,
} = require('../middleware/rbac');

/**
 * GET ALL EMPLOYEES
 */
const list = asyncHandler(async (req, res) => {
  const employees = await listEmployees(req.organizationId);

  return ok(res, {
    data: employees,
  });
});

/**
 * CREATE EMPLOYEE
 */
const create = asyncHandler(async (req, res) => {
  const parsed = createEmployeeSchema.safeParse(req.body);

  if (!parsed.success) {
    return fail(
      res,
      parsed.error.issues[0]?.message || 'Invalid input',
      400
    );
  }

  const recruiterRole = req.user?.role;
  const targetRole = parsed.data.systemRole || 'employee';

  /**
   * Recruitment Permission Check
   */
  const allowedRoles = RECRUITMENT_ACCESS[recruiterRole] || [];

  if (!allowedRoles.includes(targetRole)) {
    return fail(
      res,
      'Insufficient permissions to recruit this role',
      403
    );
  }

  /**
   * Create Employee
   */
  const { employee, emailResult } = await createEmployee({
    organizationId: req.organizationId,
    body: parsed.data,
  });

  /**
   * Send Notifications
   */
  const approvers = await notificationSvc.findUsersByRoles(
    req.organizationId,
    ['manager', 'hr']
  );

  await notificationSvc.createNotificationsForUsers({
    userIds: approvers.map((u) => u.id),
    organizationId: req.organizationId,
    title: 'New Employee Added',
    body: `A new employee (${employee.firstName} ${employee.lastName}) was added.`,
    type: 'employee',
    link: '/company/employees',
  });

  return ok(
    res,
    {
      data: employee,
      emailSent: emailResult.sent,
      message: emailResult.sent
        ? 'Employee created and credentials email sent'
        : `Employee created. Email not sent: ${emailResult.reason}`,
    },
    201
  );
});

/**
 * UPDATE EMPLOYEE
 */
const update = asyncHandler(async (req, res) => {
  const employeeId = Number(req.params.id);

  if (!Number.isFinite(employeeId)) {
    return fail(res, 'Invalid employee id', 400);
  }

  /**
   * Only Manager / HR / Team Lead
   */
  const editorRole = req.user?.role;

  const allowedEditors = ['manager', 'hr', 'team_lead'];

  if (!allowedEditors.includes(editorRole)) {
    return fail(
      res,
      'Insufficient permissions to edit employee profile',
      403
    );
  }

  /**
   * Validate Input
   */
  const parsed = updateEmployeeSchema.safeParse(req.body);

  if (!parsed.success) {
    return fail(
      res,
      parsed.error.issues[0]?.message || 'Invalid input',
      400
    );
  }

  /**
   * Update Employee
   */
  const employee = await updateEmployee({
    organizationId: req.organizationId,
    employeeId,
    body: parsed.data,
  });

  return ok(res, {
    data: employee,
    message: 'Employee updated successfully',
  });
});

/**
 * DEACTIVATE EMPLOYEE
 */
const remove = asyncHandler(async (req, res) => {
  const employeeId = Number(req.params.id);

  if (!Number.isFinite(employeeId)) {
    return fail(res, 'Invalid employee id', 400);
  }

  /**
   * Only Manager or HR
   */
  const allowedRoles = ['manager', 'hr'];

  if (!allowedRoles.includes(req.user?.role)) {
    return fail(
      res,
      'Insufficient permissions to deactivate employee',
      403
    );
  }

  const result = await deactivateEmployee({
    organizationId: req.organizationId,
    employeeId,
  });

  return ok(res, {
    data: result,
    message: 'Employee deactivated successfully',
  });
});

/**
 * GET SINGLE EMPLOYEE
 */
const get = asyncHandler(async (req, res) => {
  const employeeId = Number(req.params.id);

  if (!Number.isFinite(employeeId)) {
    return fail(res, 'Invalid employee id', 400);
  }

  const employee = await getEmployeeById({
    organizationId: req.organizationId,
    employeeId,
  });

  return ok(res, {
    data: employee,
  });
});

/**
 * UPDATE EMPLOYEE SYSTEM ROLE
 */
const updateRole = asyncHandler(async (req, res) => {
  const employeeId = Number(req.params.id);

  if (!Number.isFinite(employeeId)) {
    return fail(res, 'Invalid employee id', 400);
  }

  /**
   * Prevent self-role modification
   */
  if (req.user.id === employeeId) {
    return fail(
      res,
      'You cannot modify your own role',
      403
    );
  }

  const { role } = req.body;

  if (!role) {
    return fail(res, 'Role is required', 400);
  }

  let systemRole = 'employee';
  if (role === 'Admin' || role === 'Manager') systemRole = 'manager';
  else if (role === 'HR') systemRole = 'hr';
  else if (role === 'Team Lead') systemRole = 'team_lead';

  /**
   * Role Hierarchy Check
   */
  const currentUserLevel =
    ROLE_HIERARCHY[req.user.role];

  const targetRoleLevel =
    ROLE_HIERARCHY[systemRole];

  if (targetRoleLevel >= currentUserLevel) {
    return fail(
      res,
      'You cannot assign a role equal or higher than yours',
      403
    );
  }

  /**
   * Update Role
   */
  const employee = await updateEmployeeRole({
    organizationId: req.organizationId,
    employeeId,
    role,
    updatedBy: req.user.name || req.user.email,
  });

  return ok(res, {
    data: employee,
    message: 'Employee role updated successfully',
  });
});

module.exports = {
  list,
  create,
  update,
  remove,
  get,
  updateRole,
};