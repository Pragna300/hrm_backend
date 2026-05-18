const { prisma } = require('../config/database');
const { emitNotificationToUser } = require('../lib/notificationSocket');

async function createNotification({ userId, organizationId = null, title, body, type = 'general', link = null }) {
  const notification = await prisma.notification.create({
    data: {
      userId,
      organizationId,
      title,
      body,
      type,
      link,
      readAt: null,
    },
  });

  emitNotificationToUser(userId, 'receive_notification', {
    ...notification,
    isRead: false,
    unreadCount: await countUnread(userId),
  });

  return notification;
}

async function createNotificationsForUsers({ userIds, organizationId = null, title, body, type = 'general', link = null }) {
  if (!Array.isArray(userIds) || userIds.length === 0) return [];
  const created = [];
  await Promise.all(
    userIds.map(async (userId) => {
      const notification = await createNotification({
        userId,
        organizationId,
        title,
        body,
        type,
        link,
      });
      created.push(notification);
    })
  );
  return created;
}

async function listNotifications({ userId, page = 1, limit = 15 }) {
  const sanitizedPage = Math.max(1, Number(page) || 1);
  const sanitizedLimit = Math.min(50, Math.max(5, Number(limit) || 15));
  const [data, total] = await Promise.all([
    prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      skip: (sanitizedPage - 1) * sanitizedLimit,
      take: sanitizedLimit,
    }),
    prisma.notification.count({ where: { userId } }),
  ]);

  return {
    data: data.map((item) => ({ ...item, isRead: Boolean(item.readAt) })),
    meta: {
      total,
      page: sanitizedPage,
      limit: sanitizedLimit,
      pages: Math.ceil(total / sanitizedLimit),
    },
  };
}

async function countUnread(userId) {
  return prisma.notification.count({ where: { userId, readAt: null } });
}

async function markAsRead({ userId, notificationId }) {
  const notification = await prisma.notification.findUnique({ where: { id: notificationId } });
  if (!notification || notification.userId !== userId) return null;
  return prisma.notification.update({ where: { id: notificationId }, data: { readAt: new Date() } });
}

async function markAllAsRead(userId) {
  await prisma.notification.updateMany({ where: { userId, readAt: null }, data: { readAt: new Date() } });
}

async function deleteNotification({ userId, notificationId }) {
  const notification = await prisma.notification.findUnique({ where: { id: notificationId } });
  if (!notification || notification.userId !== userId) return null;
  return prisma.notification.delete({ where: { id: notificationId } });
}

async function findUsersByRoles(organizationId, roles) {
  return prisma.user.findMany({
    where: { organizationId, role: { in: roles } },
    select: { id: true },
  });
}

module.exports = {
  createNotification,
  createNotificationsForUsers,
  listNotifications,
  countUnread,
  markAsRead,
  markAllAsRead,
  deleteNotification,
  findUsersByRoles,
};