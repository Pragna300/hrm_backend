const { ok, fail, asyncHandler } = require('../utils/response');
const notificationSvc = require('../services/notifications');

const list = asyncHandler(async (req, res) => {
  const page = Number(req.query.page) || 1;
  const limit = Number(req.query.limit) || 15;
  const data = await notificationSvc.listNotifications({ userId: req.user.userId, page, limit });
  return ok(res, { data });
});

const unreadCount = asyncHandler(async (req, res) => {
  const count = await notificationSvc.countUnread(req.user.userId);
  return ok(res, { data: { count } });
});

const create = asyncHandler(async (req, res) => {
  const { userId, title, body, type, link } = req.body || {};
  if (!title || !body) return fail(res, 'title and body are required', 400);

  const targetUserId = userId ? Number(userId) : req.user.userId;
  if (targetUserId !== req.user.userId && req.user.role !== 'super_admin') {
    return fail(res, 'Only super admin may create notifications for other users', 403);
  }

  const notification = await notificationSvc.createNotification({
    userId: targetUserId,
    organizationId: req.user.organizationId || null,
    title: String(title).trim(),
    body: String(body).trim(),
    type: String(type || 'general').trim(),
    link: link ? String(link).trim() : null,
  });

  return ok(res, { data: notification }, 201);
});

const markAsRead = asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return fail(res, 'Invalid notification id', 400);
  const notif = await notificationSvc.markAsRead({ userId: req.user.userId, notificationId: id });
  if (!notif) return fail(res, 'Notification not found', 404);
  return ok(res, { data: notif, message: 'Notification marked as read' });
});

const markAllAsRead = asyncHandler(async (req, res) => {
  await notificationSvc.markAllAsRead(req.user.userId);
  return ok(res, { message: 'All notifications marked as read' });
});

const remove = asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return fail(res, 'Invalid notification id', 400);
  const deleted = await notificationSvc.deleteNotification({ userId: req.user.userId, notificationId: id });
  if (!deleted) return fail(res, 'Notification not found', 404);
  return ok(res, { data: deleted, message: 'Notification deleted' });
});

module.exports = { list, unreadCount, create, markAsRead, markAllAsRead, remove };