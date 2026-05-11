const { prisma } = require('../config/database');
const { diffDaysInclusive, formatYmd, startOfDayInTz } = require('../lib/dates');
const { sendLeaveRequested, sendLeaveDecided } = require('../lib/mailer');

/** Lists leave types for the org. Manager/HR can also see inactive ones via `includeInactive`. */
async function listLeaveTypes(organizationId, { includeInactive = false } = {}) {
  return prisma.leaveType.findMany({
    where: includeInactive
      ? { organizationId }
      : { organizationId, isActive: true },
    orderBy: { id: 'asc' },
  });
}

async function upsertLeaveType({ organizationId, id, body }) {
  const data = {
    name: body.name,
    code: body.code,
    yearlyQuota: body.yearlyQuota ?? 0,
    isPaid: body.isPaid ?? true,
    colorHex: body.colorHex ?? '#3174ad',
    isActive: body.isActive ?? true,
  };
  if (id) {
    return prisma.leaveType.update({
      where: { id: Number(id) },
      data,
    });
  }
  return prisma.leaveType.create({ data: { ...data, organizationId } });
}

async function getEmployeeBalances(employeeId) {
  const year = new Date().getFullYear();
  const employee = await prisma.employee.findUnique({ where: { id: employeeId } });
  if (!employee) return [];
  const types = await prisma.leaveType.findMany({
    where: { organizationId: employee.organizationId, isActive: true },
    orderBy: { id: 'asc' },
  });

  const balances = await prisma.leaveBalance.findMany({
    where: { employeeId, year },
  });

  return types.map((t) => {
    const balance = balances.find((b) => b.leaveTypeId === t.id);
    const allocated = balance ? Number(balance.allocated) : Number(t.yearlyQuota);
    const used = balance ? Number(balance.used) : 0;
    return {
      leaveTypeId: t.id,
      leaveTypeName: t.name,
      code: t.code,
      colorHex: t.colorHex,
      allocated,
      used,
      remaining: Math.max(0, allocated - used),
    };
  });
}

async function ensureBalance(tx, { employeeId, leaveTypeId, year, defaultQuota }) {
  const existing = await tx.leaveBalance.findUnique({
    where: { employeeId_leaveTypeId_year: { employeeId, leaveTypeId, year } },
  });
  if (existing) return existing;
  return tx.leaveBalance.create({
    data: { employeeId, leaveTypeId, year, allocated: defaultQuota, used: 0 },
  });
}

async function listLeaveRequests({ organizationId, employeeId = null, status = null }) {
  return prisma.leaveRequest.findMany({
    where: {
      organizationId,
      ...(employeeId ? { employeeId } : {}),
      ...(status ? { status } : {}),
    },
    orderBy: { createdAt: 'desc' },
    include: {
      employee: { select: { id: true, firstName: true, lastName: true, employeeCode: true } },
      leaveType: true,
      approver: { select: { id: true, firstName: true, lastName: true } },
    },
  });
}

async function createLeaveRequest({ organizationId, employeeId, body }) {
  const leaveTypeId = Number(body.leaveTypeId);
  const startDate = startOfDayInTz(body.startDate);
  const endDate = startOfDayInTz(body.endDate);
  if (endDate < startDate) {
    throw Object.assign(new Error('endDate must be on or after startDate'), { statusCode: 400 });
  }

  const leaveType = await prisma.leaveType.findFirst({
    where: { id: leaveTypeId, organizationId },
  });
  if (!leaveType) {
    throw Object.assign(new Error('Invalid leave type'), { statusCode: 400 });
  }

  const totalDays = diffDaysInclusive(startDate, endDate);

  const request = await prisma.leaveRequest.create({
    data: {
      organizationId,
      employeeId,
      leaveTypeId,
      startDate,
      endDate,
      totalDays,
      reason: body.reason || null,
      status: 'pending',
    },
    include: {
      employee: { select: { id: true, firstName: true, lastName: true, managerId: true } },
      leaveType: true,
    },
  });

  // Email the line manager (or org manager if no direct manager set).
  let approverEmail = null;
  let approverName = 'Manager';
  if (request.employee.managerId) {
    const directManager = await prisma.employee.findUnique({
      where: { id: request.employee.managerId },
      include: { user: true },
    });
    if (directManager?.user?.email) {
      approverEmail = directManager.user.email;
      approverName = `${directManager.firstName} ${directManager.lastName}`.trim();
    }
  }
  if (!approverEmail) {
    const orgManager = await prisma.user.findFirst({
      where: { organizationId, role: 'manager' },
      include: { employee: true },
    });
    if (orgManager?.email) {
      approverEmail = orgManager.email;
      approverName = orgManager.employee
        ? `${orgManager.employee.firstName} ${orgManager.employee.lastName}`.trim()
        : 'Manager';
    }
  }
  if (approverEmail) {
    sendLeaveRequested({
      to: approverEmail,
      approverName,
      requesterName: `${request.employee.firstName} ${request.employee.lastName}`.trim(),
      leaveType: request.leaveType.name,
      startDate: formatYmd(request.startDate),
      endDate: formatYmd(request.endDate),
      reason: request.reason,
    });
  }

  return request;
}

async function decideLeaveRequest({ organizationId, leaveRequestId, approverEmployeeId, decision, note }) {
  const status = decision === 'approve' ? 'approved' : 'rejected';

  return prisma.$transaction(async (tx) => {
    const request = await tx.leaveRequest.findFirst({
      where: { id: leaveRequestId, organizationId },
      include: { leaveType: true, employee: { include: { user: true } } },
    });
    if (!request) {
      throw Object.assign(new Error('Leave request not found'), { statusCode: 404 });
    }
    if (request.status !== 'pending') {
      throw Object.assign(new Error('Request is not pending'), { statusCode: 400 });
    }

    if (status === 'approved') {
      const year = new Date(request.startDate).getFullYear();
      const balance = await ensureBalance(tx, {
        employeeId: request.employeeId,
        leaveTypeId: request.leaveTypeId,
        year,
        defaultQuota: Number(request.leaveType.yearlyQuota),
      });
      const newUsed = Number(balance.used) + Number(request.totalDays);
      await tx.leaveBalance.update({
        where: { id: balance.id },
        data: { used: newUsed },
      });
    }

    const updated = await tx.leaveRequest.update({
      where: { id: leaveRequestId },
      data: {
        status,
        approverId: approverEmployeeId,
        approverNote: note || null,
        decidedAt: new Date(),
      },
      include: { leaveType: true, employee: { include: { user: true } } },
    });

    if (updated.employee?.user?.email) {
      sendLeaveDecided({
        to: updated.employee.user.email,
        requesterName: `${updated.employee.firstName} ${updated.employee.lastName}`.trim(),
        status,
        leaveType: updated.leaveType.name,
        startDate: formatYmd(updated.startDate),
        endDate: formatYmd(updated.endDate),
        approverNote: updated.approverNote,
      });
    }

    return updated;
  });
}

async function cancelLeaveRequest({ employeeId, leaveRequestId }) {
  const request = await prisma.leaveRequest.findFirst({
    where: { id: leaveRequestId, employeeId },
  });
  if (!request) {
    throw Object.assign(new Error('Leave request not found'), { statusCode: 404 });
  }
  if (request.status !== 'pending') {
    throw Object.assign(new Error('Only pending requests can be cancelled'), { statusCode: 400 });
  }
  return prisma.leaveRequest.update({
    where: { id: leaveRequestId },
    data: { status: 'cancelled', decidedAt: new Date() },
  });
}

module.exports = {
  listLeaveTypes,
  upsertLeaveType,
  getEmployeeBalances,
  listLeaveRequests,
  createLeaveRequest,
  decideLeaveRequest,
  cancelLeaveRequest,
};
