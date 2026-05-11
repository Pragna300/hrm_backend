const { prisma } = require('../config/database');
const { startOfDayInTz } = require('../lib/dates');

function requireEmployee(req) {
  const id = req.user?.employeeId;
  if (!id) {
    const err = new Error('No employee profile linked to this account');
    err.statusCode = 403;
    throw err;
  }
  return Number(id);
}

function isCompanyStaff(role) {
  return role === 'manager' || role === 'hr';
}

/**
 * Only higher authorities may assign tasks to lower levels — no self-assignment.
 *  - HR + Manager (company-level admins) can assign to any other employee.
 *  - Team leads can only assign to employees who report directly to them.
 *  - Regular employees cannot assign tasks.
 */
async function canAssignTaskTo({ requesterRole, requesterEmployeeId, organizationId, targetEmployeeId }) {
  if (!targetEmployeeId) return false;
  if (Number(targetEmployeeId) === Number(requesterEmployeeId)) return false;
  if (requesterRole === 'hr' || requesterRole === 'manager') return true;
  if (requesterRole === 'team_lead') {
    const target = await prisma.employee.findFirst({
      where: { id: Number(targetEmployeeId), organizationId, managerId: Number(requesterEmployeeId) },
      select: { id: true },
    });
    return !!target;
  }
  return false;
}

const ASSIGNABLE_SELECT = {
  id: true,
  firstName: true,
  lastName: true,
  employeeCode: true,
  designation: true,
  department: { select: { name: true } },
  manager: { select: { id: true, firstName: true, lastName: true, employeeCode: true } },
};

/** Employees the requester can assign tasks to. */
async function listAssignableEmployees({ requesterRole, requesterEmployeeId, organizationId }) {
  if (requesterRole === 'hr' || requesterRole === 'manager') {
    return prisma.employee.findMany({
      where: {
        organizationId,
        employmentStatus: 'active',
        NOT: { id: Number(requesterEmployeeId) },
      },
      select: ASSIGNABLE_SELECT,
      orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
    });
  }
  if (requesterRole === 'team_lead') {
    return prisma.employee.findMany({
      where: {
        organizationId,
        employmentStatus: 'active',
        managerId: Number(requesterEmployeeId),
      },
      select: ASSIGNABLE_SELECT,
      orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
    });
  }
  return [];
}

async function isReportingManagerOf({ organizationId, requesterEmployeeId, targetEmployeeId }) {
  if (!targetEmployeeId || !requesterEmployeeId) return false;
  const row = await prisma.employee.findFirst({
    where: {
      id: Number(targetEmployeeId),
      organizationId,
      managerId: Number(requesterEmployeeId),
    },
    select: { id: true },
  });
  return !!row;
}

async function canManageAssignedTask({ requesterRole, requesterEmployeeId, organizationId, assigneeEmployeeId }) {
  if (requesterRole === 'hr' || requesterRole === 'manager') return true;
  if (requesterRole === 'team_lead') {
    return await isReportingManagerOf({
      organizationId,
      requesterEmployeeId,
      targetEmployeeId: assigneeEmployeeId,
    });
  }
  return false;
}

/** Reporting managers in the org (employees that appear as someone else's `managerId`). */
async function listReportingManagers(organizationId) {
  const distinctRows = await prisma.employee.findMany({
    where: { organizationId, managerId: { not: null } },
    distinct: ['managerId'],
    select: { managerId: true },
  });
  const ids = distinctRows.map((r) => r.managerId).filter((v) => v != null);
  if (ids.length === 0) return [];
  return prisma.employee.findMany({
    where: { id: { in: ids }, organizationId },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      employeeCode: true,
      designation: true,
    },
    orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
  });
}

// --- News ---
async function listNews(organizationId) {
  return prisma.newsPost.findMany({
    where: { organizationId },
    orderBy: { createdAt: 'desc' },
    include: { author: { select: { id: true, email: true } } },
  });
}

async function createNews({ organizationId, authorUserId, title, body }) {
  return prisma.newsPost.create({
    data: { organizationId, authorUserId, title, body },
    include: { author: { select: { id: true, email: true } } },
  });
}

// --- Documents ---
async function listDocumentsForEmployee(organizationId, employeeId) {
  return prisma.employeeDocument.findMany({
    where: { organizationId, employeeId },
    orderBy: { createdAt: 'desc' },
    include: { uploadedBy: { select: { id: true, email: true } } },
  });
}

async function createDocument({ organizationId, employeeId, title, fileUrl, category, uploadedByUserId }) {
  return prisma.employeeDocument.create({
    data: { organizationId, employeeId, title, fileUrl, category: category || null, uploadedByUserId },
    include: { uploadedBy: { select: { id: true, email: true } } },
  });
}

// --- Tasks ---
function startOfToday() {
  return startOfDayInTz(new Date());
}

function endOfToday() {
  const d = startOfToday();
  d.setUTCDate(d.getUTCDate() + 1);
  return d;
}

/** Build the base scope (`my` = assigned to me, `team` = assigned to my team). */
function buildScopeWhere({ organizationId, requesterEmployeeId, requesterRole, scope, managerId }) {
  if (scope === 'team') {
    if (requesterRole === 'hr' || requesterRole === 'manager') {
      const assigneeWhere = managerId
        ? { managerId: Number(managerId) }
        : {}; // HR/Manager → all tasks if no filter
      return { organizationId, ...(Object.keys(assigneeWhere).length ? { assignee: assigneeWhere } : {}) };
    }
    if (requesterRole === 'team_lead') {
      return {
        organizationId,
        assignee: { managerId: Number(requesterEmployeeId) },
      };
    }
    // Regular employees have no team scope.
    return { organizationId, id: -1 }; // returns nothing
  }
  return { organizationId, assigneeEmployeeId: Number(requesterEmployeeId) };
}

function applyView(base, view) {
  const today = startOfToday();
  const tomorrow = endOfToday();
  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);

  if (view === 'completed') return { ...base, status: 'completed' };
  if (view === 'all') return base;
  if (view === 'overdue') {
    return { ...base, status: { not: 'completed' }, dueDate: { lt: today } };
  }
  if (view === 'due_today') {
    return { ...base, status: { not: 'completed' }, dueDate: { gte: today, lt: tomorrow } };
  }
  if (view === 'upcoming') {
    return { ...base, status: { not: 'completed' }, dueDate: { gte: tomorrow } };
  }
  if (view === 'new') {
    return { ...base, status: 'open', createdAt: { gte: weekAgo } };
  }
  // default ('my'): open + incomplete
  return { ...base, status: { not: 'completed' } };
}

const TASK_INCLUDE = {
  addedBy: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      employeeCode: true,
      department: { select: { name: true } },
    },
  },
  relatedTo: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      employeeCode: true,
      profilePhotoUrl: true,
      department: { select: { name: true } },
    },
  },
  assignee: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      employeeCode: true,
      profilePhotoUrl: true,
      department: { select: { name: true } },
      manager: { select: { id: true, firstName: true, lastName: true, employeeCode: true } },
    },
  },
};

async function listTasks({ organizationId, requesterEmployeeId, requesterRole, scope, view, managerId }) {
  const base = buildScopeWhere({ organizationId, requesterEmployeeId, requesterRole, scope, managerId });
  const where = applyView(base, view);
  return prisma.employeeTask.findMany({
    where,
    orderBy: [{ dueDate: 'asc' }, { id: 'desc' }],
    include: TASK_INCLUDE,
  });
}

async function taskSummary({ organizationId, requesterEmployeeId, requesterRole, scope, managerId }) {
  const today = startOfToday();
  const tomorrow = endOfToday();
  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);

  const base = buildScopeWhere({ organizationId, requesterEmployeeId, requesterRole, scope, managerId });
  const [my, overdue, newCount, dueToday, upcoming, completed, all] = await Promise.all([
    prisma.employeeTask.count({ where: { ...base, status: { not: 'completed' } } }),
    prisma.employeeTask.count({ where: { ...base, status: { not: 'completed' }, dueDate: { lt: today } } }),
    prisma.employeeTask.count({ where: { ...base, status: 'open', createdAt: { gte: weekAgo } } }),
    prisma.employeeTask.count({
      where: { ...base, status: { not: 'completed' }, dueDate: { gte: today, lt: tomorrow } },
    }),
    prisma.employeeTask.count({ where: { ...base, status: { not: 'completed' }, dueDate: { gte: tomorrow } } }),
    prisma.employeeTask.count({ where: { ...base, status: 'completed' } }),
    prisma.employeeTask.count({ where: base }),
  ]);

  return { my, overdue, new: newCount, dueToday, upcoming, completed, all };
}

async function createTask({
  organizationId,
  assigneeEmployeeId,
  title,
  description,
  category,
  dueDate,
  addedByEmployeeId,
  relatedToEmployeeId,
}) {
  return prisma.employeeTask.create({
    data: {
      organizationId,
      assigneeEmployeeId,
      title,
      description: description || null,
      category: category || 'Custom Task',
      dueDate: new Date(dueDate),
      addedByEmployeeId: addedByEmployeeId || null,
      relatedToEmployeeId: relatedToEmployeeId || null,
      status: 'open',
    },
    include: {
      addedBy: { select: { id: true, firstName: true, lastName: true, employeeCode: true } },
      relatedTo: { select: { id: true, firstName: true, lastName: true, employeeCode: true } },
    },
  });
}

async function updateTask({ organizationId, taskId, patch, requesterEmployeeId, requesterRole }) {
  const task = await prisma.employeeTask.findFirst({
    where: { id: taskId, organizationId },
  });
  if (!task) {
    const err = new Error('Task not found');
    err.statusCode = 404;
    throw err;
  }

  const isAssignee = task.assigneeEmployeeId === Number(requesterEmployeeId);
  const canManage = await canManageAssignedTask({
    requesterRole,
    requesterEmployeeId,
    organizationId,
    assigneeEmployeeId: task.assigneeEmployeeId,
  });

  if (!canManage && !isAssignee) {
    const err = new Error('Forbidden');
    err.statusCode = 403;
    throw err;
  }

  const data = {};

  if (canManage) {
    if (patch.title != null) data.title = patch.title;
    if (patch.description !== undefined) data.description = patch.description;
    if (patch.category != null) data.category = patch.category;
    if (patch.dueDate) data.dueDate = new Date(patch.dueDate);
    if (patch.assigneeEmployeeId != null) {
      const newAssignee = Number(patch.assigneeEmployeeId);
      const allowed = await canAssignTaskTo({
        requesterRole,
        requesterEmployeeId,
        organizationId,
        targetEmployeeId: newAssignee,
      });
      if (!allowed) {
        const err = new Error('Cannot reassign outside your direct reports');
        err.statusCode = 403;
        throw err;
      }
      data.assigneeEmployeeId = newAssignee;
    }
    if (patch.relatedToEmployeeId !== undefined) {
      data.relatedToEmployeeId = patch.relatedToEmployeeId ? Number(patch.relatedToEmployeeId) : null;
    }
  }

  // Assignee (and managers) can move status forward / mark complete
  if ((canManage || isAssignee) && patch.status != null) {
    data.status = patch.status;
  }

  if (Object.keys(data).length === 0) {
    const err = new Error('Nothing to update');
    err.statusCode = 400;
    throw err;
  }

  return prisma.employeeTask.update({
    where: { id: taskId },
    data,
    include: {
      addedBy: { select: { id: true, firstName: true, lastName: true, employeeCode: true } },
      relatedTo: { select: { id: true, firstName: true, lastName: true, employeeCode: true } },
    },
  });
}

async function deleteTask({ organizationId, taskId, requesterEmployeeId, requesterRole }) {
  const task = await prisma.employeeTask.findFirst({
    where: { id: taskId, organizationId },
  });
  if (!task) return;

  const allowed = await canManageAssignedTask({
    requesterRole,
    requesterEmployeeId,
    organizationId,
    assigneeEmployeeId: task.assigneeEmployeeId,
  });

  if (!allowed) {
    const err = new Error('Only HR, a manager, or the assignee’s reporting team lead can delete this task');
    err.statusCode = 403;
    throw err;
  }

  await prisma.employeeTask.delete({ where: { id: taskId } });
}

// --- Org chart ---
async function getOrgChart(organizationId) {
  const [departments, employees] = await Promise.all([
    prisma.department.findMany({
      where: { organizationId, isActive: true },
      orderBy: { id: 'asc' },
    }),
    prisma.employee.findMany({
      where: { organizationId, employmentStatus: 'active' },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        employeeCode: true,
        designation: true,
        departmentId: true,
        managerId: true,
        profilePhotoUrl: true,
      },
    }),
  ]);
  return { departments, employees };
}

// --- Self profile (editable fields) ---
const EDITABLE_SELF_FIELDS = [
  'personalEmail',
  'personalPhone',
  'emergencyName',
  'emergencyPhone',
  'addressLine1',
  'city',
  'state',
  'postalCode',
  'profilePhotoUrl',
];

async function updateSelfProfile({ employeeId, organizationId, body }) {
  const data = {};
  for (const key of EDITABLE_SELF_FIELDS) {
    if (body[key] !== undefined) data[key] = body[key];
  }
  if (Object.keys(data).length === 0) {
    const err = new Error('No valid fields to update');
    err.statusCode = 400;
    throw err;
  }
  return prisma.employee.update({
    where: { id: employeeId, organizationId },
    data,
    include: {
      department: { select: { id: true, name: true } },
      location: { select: { id: true, name: true } },
      manager: { select: { firstName: true, lastName: true, employeeCode: true } },
    },
  });
}

async function getBadges(organizationId, employeeId) {
  const today = startOfToday();
  const [documentsCount, overdueTaskCount] = await Promise.all([
    prisma.employeeDocument.count({ where: { organizationId, employeeId } }),
    prisma.employeeTask.count({
      where: {
        organizationId,
        assigneeEmployeeId: employeeId,
        status: { not: 'completed' },
        dueDate: { lt: today },
      },
    }),
  ]);
  return { documentsCount, overdueTaskCount };
}

async function getEmployeeProfile(employeeId, organizationId) {
  const emp = await prisma.employee.findFirst({
    where: { id: employeeId, organizationId },
    include: {
      department: true,
      location: true,
      shift: true,
      manager: { select: { id: true, firstName: true, lastName: true, employeeCode: true } },
      user: { select: { id: true, email: true, role: true } },
    },
  });
  if (!emp) {
    const err = new Error('Employee not found');
    err.statusCode = 404;
    throw err;
  }
  return emp;
}

module.exports = {
  requireEmployee,
  isCompanyStaff,
  canAssignTaskTo,
  canManageAssignedTask,
  listAssignableEmployees,
  listReportingManagers,
  isReportingManagerOf,
  listNews,
  createNews,
  listDocumentsForEmployee,
  createDocument,
  listTasks,
  taskSummary,
  createTask,
  updateTask,
  deleteTask,
  getOrgChart,
  updateSelfProfile,
  getBadges,
  getEmployeeProfile,
};
