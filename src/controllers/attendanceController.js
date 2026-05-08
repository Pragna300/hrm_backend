const { prisma } = require('../config/database');
const { ok, fail, asyncHandler } = require('../utils/response');
const { attendanceCalendarDate } = require('../lib/dates');
const { buildTodaySummary } = require('../lib/attendanceSummary');

function requireEmployeeId(req) {
  const id = req.user?.employeeId;
  if (id == null || id === '') return null;
  return Number(id);
}

async function loadTodaySummary(employeeId, date) {
  const segments = await prisma.attendanceSegment.findMany({
    where: { employeeId, date },
    orderBy: { checkIn: 'asc' },
  });
  return buildTodaySummary(segments, new Date());
}

const today = asyncHandler(async (req, res) => {
  const employeeId = requireEmployeeId(req);
  if (employeeId == null) {
    return fail(res, 'No employee profile is linked to this account.', 403);
  }
  const date = attendanceCalendarDate();
  const summary = await loadTodaySummary(employeeId, date);
  return ok(res, { data: { date, ...summary } });
});

const tapIn = asyncHandler(async (req, res) => {
  const employeeId = requireEmployeeId(req);
  if (employeeId == null) {
    return fail(res, 'No employee profile is linked to this account.', 403);
  }
  const date = attendanceCalendarDate();
  const now = new Date();

  await prisma.$transaction(async (tx) => {
    const open = await tx.attendanceSegment.findMany({
      where: { employeeId, date, checkOut: null },
    });
    for (const row of open) {
      await tx.attendanceSegment.update({
        where: { id: row.id },
        data: { checkOut: now },
      });
    }
    await tx.attendanceSegment.create({
      data: { employeeId, date, checkIn: now, source: 'web' },
    });
  });

  const summary = await loadTodaySummary(employeeId, date);
  return ok(res, { data: summary, message: 'Tapped in' });
});

const tapOut = asyncHandler(async (req, res) => {
  const employeeId = requireEmployeeId(req);
  if (employeeId == null) {
    return fail(res, 'No employee profile is linked to this account.', 403);
  }
  const date = attendanceCalendarDate();
  const now = new Date();

  const open = await prisma.attendanceSegment.findFirst({
    where: { employeeId, date, checkOut: null },
    orderBy: { checkIn: 'desc' },
  });
  if (!open) return fail(res, 'No open tap-in session. Tap in first.', 400);

  await prisma.attendanceSegment.update({
    where: { id: open.id },
    data: { checkOut: now },
  });

  const summary = await loadTodaySummary(employeeId, date);
  return ok(res, { data: summary, message: 'Tapped out' });
});

const myHistory = asyncHandler(async (req, res) => {
  const employeeId = requireEmployeeId(req);
  if (employeeId == null) {
    return fail(res, 'No employee profile is linked to this account.', 403);
  }
  const days = Math.min(60, Math.max(1, Number(req.query.days) || 30));
  const since = new Date();
  since.setDate(since.getDate() - days);

  const rows = await prisma.attendanceSegment.findMany({
    where: { employeeId, date: { gte: since } },
    orderBy: [{ date: 'desc' }, { checkIn: 'asc' }],
  });
  return ok(res, { data: rows });
});

const teamToday = asyncHandler(async (req, res) => {
  const date = attendanceCalendarDate();
  const employees = await prisma.employee.findMany({
    where: { organizationId: req.organizationId },
    select: { id: true, firstName: true, lastName: true, employeeCode: true, departmentId: true },
  });
  const segments = await prisma.attendanceSegment.findMany({
    where: { employeeId: { in: employees.map((e) => e.id) }, date },
  });
  const data = employees.map((emp) => {
    const empSegments = segments.filter((s) => s.employeeId === emp.id);
    const summary = buildTodaySummary(empSegments, new Date());
    return { ...emp, ...summary };
  });
  return ok(res, { data });
});

module.exports = { today, tapIn, tapOut, myHistory, teamToday };
