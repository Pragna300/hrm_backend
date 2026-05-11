const { prisma } = require('../config/database');
const { attendanceCalendarDate } = require('../lib/dates');

/** Aggregated stats used by the company dashboard. */
async function getCompanyOverview(organizationId) {
  const [
    totalEmployees,
    activeEmployees,
    departments,
    locations,
    pendingLeaves,
    todayAttendance,
    payrollRunsCount,
    announcements,
  ] = await Promise.all([
    prisma.employee.count({ where: { organizationId } }),
    prisma.employee.count({ where: { organizationId, employmentStatus: 'active' } }),
    prisma.department.count({ where: { organizationId, isActive: true } }),
    prisma.location.count({ where: { organizationId, isActive: true } }),
    prisma.leaveRequest.count({ where: { organizationId, status: 'pending' } }),
    prisma.attendanceSegment.findMany({
      where: { date: attendanceCalendarDate(), employee: { organizationId } },
      select: { employeeId: true },
    }),
    prisma.payrollRun.count({ where: { organizationId } }),
    prisma.announcement.findMany({
      where: { organizationId },
      orderBy: [{ isPinned: 'desc' }, { createdAt: 'desc' }],
      take: 5,
    }),
  ]);

  const presentToday = new Set(todayAttendance.map((s) => s.employeeId)).size;

  const recentLeaves = await prisma.leaveRequest.findMany({
    where: { organizationId },
    orderBy: { createdAt: 'desc' },
    take: 5,
    include: {
      employee: { select: { firstName: true, lastName: true } },
      leaveType: { select: { name: true } },
    },
  });

  return {
    totalEmployees,
    activeEmployees,
    departments,
    locations,
    pendingLeaves,
    presentToday,
    payrollRunsCount,
    announcements,
    recentLeaves,
  };
}

module.exports = { getCompanyOverview };
