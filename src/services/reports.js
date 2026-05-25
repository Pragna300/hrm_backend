const { prisma } = require('../config/database');

function msToHours(ms) {
  return ms / (1000 * 60 * 60);
}

function formatTime(date) {
  if (!date) return null;
  try {
    return new Date(date).toISOString();
  } catch {
    return null;
  }
}

function normalizeDate(value) {
  const date = new Date(value);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function formatDateKey(date) {
  return date.toISOString().slice(0, 10);
}

function buildDateRange(start, end) {
  const dates = [];
  const current = new Date(start);
  while (current <= end) {
    dates.push(formatDateKey(current));
    current.setDate(current.getDate() + 1);
  }
  return dates;
}

function buildEmployeeFilters(orgId, options = {}) {
  const { employeeIds, department, shift } = options;
  const filter = { organizationId: orgId };

  if (Array.isArray(employeeIds) && employeeIds.length > 0) {
    filter.id = { in: employeeIds };
  }
  if (department) {
    filter.department = { name: department };
  }
  if (shift) {
    filter.shift = { name: shift };
  }

  return filter;
}

function buildAttendanceStatus(segs, shift) {
  if (!segs || segs.length === 0) return 'Absent';
  const firstTapIn = segs[0].checkIn;
  if (!firstTapIn) return 'Absent';

  const shiftStart = shift?.startTime;
  if (shiftStart) {
    const shiftDate = normalizeDate(segs[0].date);
    const shiftStartDate = new Date(shiftDate);
    shiftStartDate.setHours(new Date(shiftStart).getHours(), new Date(shiftStart).getMinutes(), 0, 0);
    return new Date(firstTapIn) > shiftStartDate ? 'Late' : 'Present';
  }
  const defaultStart = normalizeDate(segs[0].date);
  defaultStart.setHours(9, 0, 0, 0);
  return new Date(firstTapIn) > defaultStart ? 'Late' : 'Present';
}

function buildReportRow(employee, dateKey, segs) {
  const dateValue = new Date(dateKey);
  if (!segs || segs.length === 0) {
    return {
      employeeId: employee.id,
      employeeCode: employee.employeeCode,
      employeeName: `${employee.firstName} ${employee.lastName}`,
      department: employee.departments?.[0]?.department?.name ?? null,
      designation: employee.designation ?? null,
      date: dateKey,
      day: dateValue.toLocaleDateString('en-US', { weekday: 'long' }),
      sessionCount: 0,
      firstTapIn: null,
      lastTapOut: null,
      totalWorkingHours: 0,
      breakTime: 0,
      activeWorkingHours: 0,
      overtimeHours: 0,
      lateEntryDuration: 0,
      earlyExitDuration: 0,
      attendanceStatus: 'Absent',
      shiftName: employee.shift?.name ?? null,
      workMode: 'Office',
      managerRemarks: null,
      approvalStatus: 'Pending',
      createdAt: null,
    };
  }

  const sorted = segs.slice().sort((a, b) => new Date(a.checkIn) - new Date(b.checkIn));
  const firstTapIn = sorted[0].checkIn;
  const lastTapOut = sorted[sorted.length - 1].checkOut || null;

  let totalWorkedMs = 0;
  for (const seg of sorted) {
    if (seg.checkOut) totalWorkedMs += new Date(seg.checkOut) - new Date(seg.checkIn);
  }

  let breakMs = 0;
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1];
    const curr = sorted[i];
    if (prev.checkOut && curr.checkIn) {
      const gap = new Date(curr.checkIn) - new Date(prev.checkOut);
      if (gap > 0) breakMs += gap;
    }
  }

  const activeWorkingMs = Math.max(0, totalWorkedMs - breakMs);
  const activeHours = msToHours(activeWorkingMs);
  const totalHours = msToHours(totalWorkedMs);
  const standardDayHours = 8;
  const overtimeHours = Math.max(0, activeHours - standardDayHours);

  let lateMs = 0;
  const shiftStart = employee.shift?.startTime;
  if (shiftStart) {
    const shiftDate = normalizeDate(sorted[0].date);
    const shiftStartDate = new Date(shiftDate);
    shiftStartDate.setHours(new Date(shiftStart).getHours(), new Date(shiftStart).getMinutes(), 0, 0);
    lateMs = Math.max(0, new Date(firstTapIn) - shiftStartDate);
  } else {
    const defaultStart = normalizeDate(sorted[0].date);
    defaultStart.setHours(9, 0, 0, 0);
    lateMs = Math.max(0, new Date(firstTapIn) - defaultStart);
  }

  const attendanceStatus = buildAttendanceStatus(sorted, employee.shift);

  return {
    employeeId: employee.id,
    employeeCode: employee.employeeCode,
    employeeName: `${employee.firstName} ${employee.lastName}`,
    department: employee.departments?.[0]?.department?.name ?? null,
    designation: employee.designation ?? null,
    date: dateKey,
    day: dateValue.toLocaleDateString('en-US', { weekday: 'long' }),
    sessionCount: sorted.length,
    firstTapIn: formatTime(firstTapIn),
    lastTapOut: formatTime(lastTapOut),
    totalWorkingHours: totalHours,
    breakTime: msToHours(breakMs),
    activeWorkingHours: activeHours,
    overtimeHours,
    lateEntryDuration: msToHours(lateMs),
    earlyExitDuration: 0,
    attendanceStatus,
    shiftName: employee.shift?.name ?? null,
    workMode: 'Office',
    managerRemarks: null,
    approvalStatus: 'Pending',
    createdAt: sorted[0].createdAt,
  };
}

function filterByStatus(rows, status) {
  const statuses = Array.isArray(status) ? status.map((value) => value.toString().trim()).filter(Boolean) : [];
  if (statuses.length === 0) return rows;
  return rows.filter((row) => statuses.includes(row.attendanceStatus));
}

async function fetchReportData(orgId, filters) {
  const { employeeIds, department, shift, fromDate, toDate, status } = filters;
  const from = normalizeDate(fromDate);
  const to = normalizeDate(toDate);
  to.setHours(23, 59, 59, 999);

  const employees = await prisma.employee.findMany({
    where: buildEmployeeFilters(orgId, { employeeIds, department, shift }),
    include: { departments: { include: { department: true } }, shift: true, user: true },
    orderBy: { firstName: 'asc' },
  });

  const employeeIdsList = employees.map((e) => e.id);
  if (employeeIdsList.length === 0) {
    return { rows: [], employees };
  }

  const segments = await prisma.attendanceSegment.findMany({
    where: {
      employeeId: { in: employeeIdsList },
      date: { gte: from, lte: to },
    },
    include: { employee: { include: { departments: { include: { department: true } }, shift: true } } },
    orderBy: [{ employeeId: 'asc' }, { date: 'asc' }, { checkIn: 'asc' }],
  });

  const grouped = {};
  for (const segment of segments) {
    const key = `${segment.employeeId}|${formatDateKey(segment.date)}`;
    grouped[key] = grouped[key] || [];
    grouped[key].push(segment);
  }

  const dates = buildDateRange(from, to);
  const rows = [];

  for (const employee of employees) {
    for (const dateKey of dates) {
      const row = buildReportRow(employee, dateKey, grouped[`${employee.id}|${dateKey}`] || []);
      rows.push(row);
    }
  }

  const filteredRows = filterByStatus(rows, status);
  return { rows: filteredRows, employees };
}

function calculateSummary(rows, totalEmployees) {
  const presentCount = rows.filter((r) => r.attendanceStatus === 'Present' || r.attendanceStatus === 'Late').length;
  const absentCount = rows.filter((r) => r.attendanceStatus === 'Absent').length;
  const lateArrivals = rows.filter((r) => r.attendanceStatus === 'Late').length;
  const totalWorkingHours = rows.reduce((sum, row) => sum + (row.totalWorkingHours || 0), 0);
  const totalOvertime = rows.reduce((sum, row) => sum + (row.overtimeHours || 0), 0);
  return { totalEmployees, presentCount, absentCount, lateArrivals, totalWorkingHours, totalOvertime };
}

async function generateAttendanceReport(orgId, filters) {
  const { page = 1, pageSize = 25 } = filters;
  const { rows, employees } = await fetchReportData(orgId, filters);
  const total = rows.length;
  const paged = rows.slice((page - 1) * pageSize, page * pageSize);
  const summary = calculateSummary(rows, employees.length);
  return { rows: paged, total, page, pageSize, summary };
}

async function generateAttendanceCsv(orgId, filters) {
  const { rows } = await fetchReportData(orgId, filters);

  const headers = [
    'Employee ID',
    'Employee Code',
    'Employee Name',
    'Department',
    'Designation',
    'Date',
    'First Tap In',
    'Last Tap Out',
    'Total Working Hours',
    'Active Working Hours',
    'Shift Name',
  ];

  const csvRows = [headers.join(',')];
  for (const row of rows) {
    csvRows.push([
      row.employeeId,
      row.employeeCode,
      `"${row.employeeName || ''}"`,
      `"${row.department || ''}"`,
      `"${row.designation || ''}"`,
      row.date,
      row.firstTapIn || '',
      row.lastTapOut || '',
      (row.totalWorkingHours || 0).toFixed(2),
      (row.activeWorkingHours || 0).toFixed(2),
      `"${row.shiftName || ''}"`,
    ].join(','));
  }

  return csvRows.join('\n');
}

async function getOrganizationAttendanceOverview(orgId, { fromDate, toDate } = {}) {
  const org = await prisma.organization.findUnique({ where: { id: orgId } });
  
  const to = normalizeDate(toDate || new Date());
  to.setHours(23, 59, 59, 999);
  
  let from;
  if (fromDate) {
    from = normalizeDate(fromDate);
  } else {
    from = org?.createdAt ? normalizeDate(org.createdAt) : normalizeDate(new Date());
    if (!fromDate && !org?.createdAt) {
      from.setDate(from.getDate() - 7);
    }
  }

  const employees = await prisma.employee.findMany({
    where: { organizationId: orgId },
    include: { departments: { include: { department: true } }, shift: true, user: true },
  });

  if (employees.length === 0) {
    return {
      rows: [],
      summary: {
        totalEmployees: 0,
        presentCount: 0,
        absentCount: 0,
        lateArrivals: 0,
        totalWorkingHours: 0,
        overtimeEmployees: 0,
      },
    };
  }

  const employeeIdsList = employees.map((e) => e.id);
  const segments = await prisma.attendanceSegment.findMany({
    where: {
      employeeId: { in: employeeIdsList },
      date: { gte: from, lte: to },
    },
    include: { employee: { include: { departments: { include: { department: true } }, shift: true } } },
    orderBy: [{ employeeId: 'asc' }, { date: 'asc' }, { checkIn: 'asc' }],
  });

  const grouped = {};
  for (const segment of segments) {
    const key = `${segment.employeeId}|${formatDateKey(segment.date)}`;
    grouped[key] = grouped[key] || [];
    grouped[key].push(segment);
  }

  const dates = buildDateRange(from, to);
  const rows = [];

  for (const employee of employees) {
    for (const dateKey of dates) {
      const row = buildReportRow(employee, dateKey, grouped[`${employee.id}|${dateKey}`] || []);
      rows.push(row);
    }
  }

  const summary = calculateSummary(rows, employees.length);
  const orgRegistrationDate = org?.createdAt ? formatDateKey(org.createdAt) : null;
  return { rows, summary, orgRegistrationDate };
}

async function getDayWiseSummary(orgId, { fromDate, toDate } = {}) {
  const to = normalizeDate(toDate || new Date());
  to.setHours(23, 59, 59, 999);
  const from = fromDate ? normalizeDate(fromDate) : (() => {
    const d = normalizeDate(new Date());
    d.setDate(d.getDate() - 29);
    return d;
  })();

  const employees = await prisma.employee.findMany({
    where: { organizationId: orgId },
    include: { departments: { include: { department: true } }, shift: true },
  });

  if (employees.length === 0) return [];

  const employeeIdsList = employees.map((e) => e.id);
  const segments = await prisma.attendanceSegment.findMany({
    where: {
      employeeId: { in: employeeIdsList },
      date: { gte: from, lte: to },
    },
    include: { employee: { include: { departments: { include: { department: true } }, shift: true } } },
    orderBy: [{ employeeId: 'asc' }, { date: 'asc' }, { checkIn: 'asc' }],
  });

  const grouped = {};
  for (const seg of segments) {
    const key = `${seg.employeeId}|${formatDateKey(seg.date)}`;
    grouped[key] = grouped[key] || [];
    grouped[key].push(seg);
  }

  const dates = buildDateRange(from, to);
  const result = [];

  for (const dateKey of dates) {
    const rows = [];
    for (const employee of employees) {
      const row = buildReportRow(employee, dateKey, grouped[`${employee.id}|${dateKey}`] || []);
      rows.push(row);
    }
    const present = rows.filter((r) => r.attendanceStatus === 'Present').length;
    const late    = rows.filter((r) => r.attendanceStatus === 'Late').length;
    const absent  = rows.filter((r) => r.attendanceStatus === 'Absent').length;
    const overtime = rows.filter((r) => r.overtimeHours > 0).length;
    const dateObj = new Date(dateKey);
    result.push({
      date: dateKey,
      dayLabel: dateObj.toLocaleDateString('en-US', { weekday: 'long' }),
      totalEmployees: employees.length,
      present,
      late,
      absent,
      overtime,
      rows,
    });
  }

  return result;
}

async function getDepartmentsReport(orgId) {
  const departments = await prisma.department.findMany({
    where: { organizationId: orgId },
    orderBy: { name: 'asc' },
    include: { 
      _count: { select: { employees: true } },
      manager: { include: { employee: true } }
    },
  });

  return departments.map((department) => {
    let managerName = 'Unassigned';
    if (department.manager?.employee) {
      managerName = `${department.manager.employee.firstName} ${department.manager.employee.lastName}`.trim();
    } else if (department.manager?.email) {
      managerName = department.manager.email.split('@')[0];
    }

    return {
      id: department.id,
      name: department.name,
      totalEmployees: department._count.employees,
      managerName,
      isActive: department.isActive,
      createdAt: department.createdAt,
    };
  });
}

async function getDepartmentEmployees(orgId, departmentId, options = {}) {
  const { search = '', page = 1, pageSize = 15 } = options;
  const department = await prisma.department.findFirst({
    where: { id: Number(departmentId), organizationId: orgId },
    select: { id: true, name: true },
  });

  if (!department) {
    return {
      department: null,
      employees: [],
      summary: { totalEmployees: 0, activeEmployees: 0, inactiveEmployees: 0 },
      page,
      pageSize,
      total: 0,
    };
  }

  const where = {
    organizationId: orgId,
    departments: { some: { departmentId: department.id } },
  };

  if (search) {
    where.OR = [
      { firstName: { contains: search, mode: 'insensitive' } },
      { lastName: { contains: search, mode: 'insensitive' } },
      { employeeCode: { contains: search, mode: 'insensitive' } },
      { workEmail: { contains: search, mode: 'insensitive' } },
      { personalEmail: { contains: search, mode: 'insensitive' } },
    ];
  }

  const total = await prisma.employee.count({ where });
  const activeEmployees = await prisma.employee.count({
    where: {
      ...where,
      employmentStatus: { equals: 'active', mode: 'insensitive' },
    },
  });

  const employees = await prisma.employee.findMany({
    where,
    include: { user: true },
    orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
    skip: (page - 1) * pageSize,
    take: pageSize,
  });

  return {
    department,
    employees: employees.map((employee) => ({
      id: employee.id,
      employeeCode: employee.employeeCode,
      name: `${employee.firstName} ${employee.lastName}`,
      email: employee.user?.email || employee.workEmail || employee.personalEmail || '',
      position: employee.designation || 'N/A',
      employmentStatus: employee.employmentStatus || 'unknown',
      managerId: employee.managerId,
      profilePhotoUrl: employee.profilePhotoUrl,
      role: employee.user?.role || 'employee',
    })),
    summary: {
      totalEmployees: total,
      activeEmployees,
      inactiveEmployees: total - activeEmployees,
    },
    page,
    pageSize,
    total,
  };
}

module.exports = {
  generateAttendanceReport,
  generateAttendanceCsv,
  getOrganizationAttendanceOverview,
  getDayWiseSummary,
  getDepartmentsReport,
  getDepartmentEmployees,
};
