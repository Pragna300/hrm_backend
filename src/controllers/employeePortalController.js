const { ok, fail, asyncHandler } = require('../utils/response');
const { prisma } = require('../config/database');
const svc = require('../services/employeePortal');
const notificationSvc = require('../services/notifications');
const { sendTaskAssigned } = require('../lib/mailer');

const listNews = asyncHandler(async (req, res) => {
  const data = await svc.listNews(req.organizationId);
  return ok(res, { data });
});

const postNews = asyncHandler(async (req, res) => {
  if (!svc.isCompanyStaff(req.user.role)) return fail(res, 'Only manager or HR can post news', 403);
  const { title, body } = req.body || {};
  if (!title || !body) return fail(res, 'title and body are required');
  const row = await svc.createNews({
    organizationId: req.organizationId,
    authorUserId: req.user.userId,
    title: String(title).trim(),
    body: String(body).trim(),
  });

  const recipients = await notificationSvc.findUsersByRoles(req.organizationId, ['manager', 'hr', 'team_lead', 'employee']);
  await notificationSvc.createNotificationsForUsers({
    userIds: recipients.map((u) => u.id),
    organizationId: req.organizationId,
    title: `Announcement: ${row.title}`,
    body: row.body,
    type: 'announcement',
    link: '/employee/news',
  });

  return ok(res, { data: row }, 201);
});

const listDocs = asyncHandler(async (req, res) => {
  const employeeId = svc.requireEmployee(req);
  const data = await svc.listDocumentsForEmployee(req.organizationId, employeeId);
  return ok(res, { data });
});

const postDoc = asyncHandler(async (req, res) => {
  if (!svc.isCompanyStaff(req.user.role)) return fail(res, 'Only manager or HR can upload documents', 403);
  const { employeeId, title, fileUrl, category } = req.body || {};
  if (!employeeId || !title || !fileUrl) {
    return fail(res, 'employeeId, title and fileUrl are required');
  }
  const row = await svc.createDocument({
    organizationId: req.organizationId,
    employeeId: Number(employeeId),
    title: String(title).trim(),
    fileUrl: String(fileUrl).trim(),
    category: category ? String(category) : null,
    uploadedByUserId: req.user.userId,
  });
  return ok(res, { data: row }, 201);
});

const listTasks = asyncHandler(async (req, res) => {
  const employeeId = svc.requireEmployee(req);
  const view = String(req.query.view || 'my');
  const scope = req.query.scope === 'team' ? 'team' : 'my';
  const managerId = req.query.managerId ? Number(req.query.managerId) : null;
  const data = await svc.listTasks({
    organizationId: req.organizationId,
    requesterEmployeeId: employeeId,
    requesterRole: req.user.role,
    scope,
    view,
    managerId,
  });
  return ok(res, { data });
});

const taskSummary = asyncHandler(async (req, res) => {
  const employeeId = svc.requireEmployee(req);
  const scope = req.query.scope === 'team' ? 'team' : 'my';
  const managerId = req.query.managerId ? Number(req.query.managerId) : null;
  const data = await svc.taskSummary({
    organizationId: req.organizationId,
    requesterEmployeeId: employeeId,
    requesterRole: req.user.role,
    scope,
    managerId,
  });
  return ok(res, { data });
});

const reportingManagers = asyncHandler(async (req, res) => {
  const data = await svc.listReportingManagers(req.organizationId);
  return ok(res, { data });
});

const postTask = asyncHandler(async (req, res) => {
  const me = svc.requireEmployee(req);
  const {
    assigneeEmployeeId,
    title,
    description,
    category,
    dueDate,
    relatedToEmployeeId,
  } = req.body || {};
  if (!title || !dueDate) return fail(res, 'title and dueDate are required');
  if (assigneeEmployeeId == null || assigneeEmployeeId === '') {
    return fail(res, 'assigneeEmployeeId is required — tasks must be assigned to another employee.', 400);
  }

  const requestedAssignee = Number(assigneeEmployeeId);
  if (requestedAssignee === me) {
    return fail(res, 'You cannot assign tasks to yourself. Tasks flow from higher authorities to their reports.', 403);
  }

  const allowed = await svc.canAssignTaskTo({
    requesterRole: req.user.role,
    requesterEmployeeId: me,
    organizationId: req.organizationId,
    targetEmployeeId: requestedAssignee,
  });
  if (!allowed) {
    return fail(
      res,
      'Only HR or the assignee’s reporting manager can assign tasks to that employee.',
      403,
    );
  }

  const row = await svc.createTask({
    organizationId: req.organizationId,
    assigneeEmployeeId: requestedAssignee,
    title: String(title).trim(),
    description: description ? String(description) : null,
    category: category ? String(category) : 'Custom Task',
    dueDate,
    addedByEmployeeId: me,
    relatedToEmployeeId: relatedToEmployeeId ? Number(relatedToEmployeeId) : null,
  });

  const assignee = await prisma.employee.findUnique({
    where: { id: requestedAssignee },
    include: { user: true },
  });
  const creator = await prisma.employee.findUnique({ where: { id: me } });
  const creatorName = creator ? `${creator.firstName} ${creator.lastName}`.trim() : 'HR Portal';

  if (assignee?.user?.id) {
    await notificationSvc.createNotification({
      userId: assignee.user.id,
      organizationId: req.organizationId,
      title: 'New Task Assigned',
      body: `You have been assigned a new task: ${row.title}`,
      type: 'task',
      link: '/employee/tasks',
    });
  }

  if (assignee?.user?.email) {
    sendTaskAssigned({
      to: assignee.user.email,
      employeeName: `${assignee.firstName} ${assignee.lastName}`.trim(),
      taskName: row.title,
      dueDate: new Date(row.dueDate).toLocaleDateString(),
      priority: row.category || 'Normal',
      creatorName,
    })
      .then((result) => {
        if (result && !result.sent) {
          console.error('❌ Failed to send task assigned email:', result.reason);
        }
      })
      .catch((err) => console.error('❌ Exception while sending task assigned email:', err));
  }

  return ok(res, { data: row }, 201);
});

const assignableEmployees = asyncHandler(async (req, res) => {
  const me = svc.requireEmployee(req);
  const data = await svc.listAssignableEmployees({
    requesterRole: req.user.role,
    requesterEmployeeId: me,
    organizationId: req.organizationId,
  });
  return ok(res, { data });
});

const patchTask = asyncHandler(async (req, res) => {
  const me = svc.requireEmployee(req);
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return fail(res, 'Invalid id', 400);

  const existing = await prisma.employeeTask.findUnique({
    where: { id },
    include: {
      assignee: { include: { user: true } },
      addedBy: { include: { user: true } },
    },
  });
  if (!existing) return fail(res, 'Task not found', 404);

  const data = await svc.updateTask({
    organizationId: req.organizationId,
    taskId: id,
    patch: req.body || {},
    requesterEmployeeId: me,
    requesterRole: req.user.role,
  });

  if (req.body?.status && req.body.status !== existing.status) {
    const receiver = existing.assigneeEmployeeId === me ? existing.addedBy : existing.assignee;
    if (receiver?.user?.id) {
      await notificationSvc.createNotification({
        userId: receiver.user.id,
        organizationId: req.organizationId,
        title: `Task ${data.status}`,
        body: `The task "${data.title}" was updated to ${data.status}.`,
        type: 'task_status',
        link: '/employee/tasks',
      });
    }
  }

  return ok(res, { data });
});

const removeTask = asyncHandler(async (req, res) => {
  const me = svc.requireEmployee(req);
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return fail(res, 'Invalid id', 400);
  await svc.deleteTask({
    organizationId: req.organizationId,
    taskId: id,
    requesterEmployeeId: me,
    requesterRole: req.user.role,
  });
  return ok(res, { message: 'Deleted' });
});

const orgChart = asyncHandler(async (req, res) => {
  const data = await svc.getOrgChart(req.organizationId);
  return ok(res, { data });
});

const getProfile = asyncHandler(async (req, res) => {
  const employeeId = svc.requireEmployee(req);
  const data = await svc.getEmployeeProfile(employeeId, req.organizationId);
  return ok(res, { data });
});

const patchProfile = asyncHandler(async (req, res) => {
  const employeeId = svc.requireEmployee(req);
  const data = await svc.updateSelfProfile({
    employeeId,
    organizationId: req.organizationId,
    body: req.body || {},
  });
  return ok(res, { data, message: 'Profile updated' });
});

const badges = asyncHandler(async (req, res) => {
  const employeeId = svc.requireEmployee(req);
  const data = await svc.getBadges(req.organizationId, employeeId);
  return ok(res, { data });
});

module.exports = {
  listNews,
  postNews,
  listDocs,
  postDoc,
  listTasks,
  taskSummary,
  postTask,
  patchTask,
  removeTask,
  assignableEmployees,
  reportingManagers,
  orgChart,
  getProfile,
  patchProfile,
  badges,
};
