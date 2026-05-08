const { prisma } = require('../config/database');
const { ok, fail, asyncHandler } = require('../utils/response');
const { getCompanyOverview } = require('../services/companyOverview');

const overview = asyncHandler(async (req, res) => {
  const data = await getCompanyOverview(req.organizationId);
  return ok(res, { data });
});

const settings = asyncHandler(async (req, res) => {
  const org = await prisma.organization.findUnique({
    where: { id: req.organizationId },
    include: {
      subscriptions: {
        orderBy: { id: 'desc' },
        take: 1,
        include: { plan: true },
      },
    },
  });
  return ok(res, { data: org });
});

const updateSettings = asyncHandler(async (req, res) => {
  const allowed = ['name', 'logoUrl', 'timezone', 'currency', 'address', 'sector', 'contactEmail', 'contactPhone'];
  const data = {};
  for (const key of allowed) {
    if (req.body[key] !== undefined) data[key] = req.body[key];
  }
  const updated = await prisma.organization.update({ where: { id: req.organizationId }, data });
  return ok(res, { data: updated, message: 'Settings updated' });
});

const listAnnouncements = asyncHandler(async (req, res) => {
  const rows = await prisma.announcement.findMany({
    where: { organizationId: req.organizationId },
    orderBy: [{ isPinned: 'desc' }, { createdAt: 'desc' }],
  });
  return ok(res, { data: rows });
});

const upsertAnnouncement = asyncHandler(async (req, res) => {
  const id = req.params.id ? Number(req.params.id) : null;
  const data = {
    title: req.body.title,
    body: req.body.body,
    isPinned: !!req.body.isPinned,
  };
  if (!data.title || !data.body) return fail(res, 'title and body are required');
  if (id) {
    const row = await prisma.announcement.update({ where: { id }, data });
    return ok(res, { data: row });
  }
  const row = await prisma.announcement.create({
    data: { ...data, organizationId: req.organizationId, postedById: req.user.userId },
  });
  return ok(res, { data: row }, 201);
});

const deleteAnnouncement = asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  await prisma.announcement.deleteMany({
    where: { id, organizationId: req.organizationId },
  });
  return ok(res, { message: 'Deleted' });
});

const listHolidays = asyncHandler(async (req, res) => {
  const data = await prisma.holiday.findMany({
    where: { organizationId: req.organizationId },
    orderBy: { date: 'asc' },
  });
  return ok(res, { data });
});

const upsertHoliday = asyncHandler(async (req, res) => {
  const id = req.params.id ? Number(req.params.id) : null;
  const data = {
    name: req.body.name,
    date: new Date(req.body.date),
    isOptional: !!req.body.isOptional,
  };
  if (!data.name || !req.body.date) return fail(res, 'name and date are required');
  if (id) {
    const row = await prisma.holiday.update({ where: { id }, data });
    return ok(res, { data: row });
  }
  const row = await prisma.holiday.create({
    data: { ...data, organizationId: req.organizationId },
  });
  return ok(res, { data: row }, 201);
});

const deleteHoliday = asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  await prisma.holiday.deleteMany({
    where: { id, organizationId: req.organizationId },
  });
  return ok(res, { message: 'Deleted' });
});

const billing = asyncHandler(async (req, res) => {
  const subs = await prisma.subscription.findMany({
    where: { organizationId: req.organizationId },
    orderBy: { id: 'desc' },
    include: { plan: true },
  });
  const invoices = await prisma.invoice.findMany({
    where: { organizationId: req.organizationId },
    orderBy: { issuedAt: 'desc' },
  });
  return ok(res, { data: { subscriptions: subs, invoices } });
});

module.exports = {
  overview,
  settings,
  updateSettings,
  listAnnouncements,
  upsertAnnouncement,
  deleteAnnouncement,
  listHolidays,
  upsertHoliday,
  deleteHoliday,
  billing,
};
