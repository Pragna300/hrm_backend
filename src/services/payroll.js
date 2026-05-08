const { prisma } = require('../config/database');
const { startOfDayInTz } = require('../lib/dates');
const { sendPayrollReady } = require('../lib/mailer');

async function listPayrollRuns(organizationId) {
  return prisma.payrollRun.findMany({
    where: { organizationId },
    orderBy: [{ periodStart: 'desc' }],
    include: {
      _count: { select: { items: true } },
    },
  });
}

async function getPayrollRun({ organizationId, runId }) {
  const run = await prisma.payrollRun.findFirst({
    where: { id: runId, organizationId },
    include: {
      items: {
        include: {
          employee: {
            select: { id: true, firstName: true, lastName: true, employeeCode: true, designation: true },
          },
        },
      },
    },
  });
  if (!run) {
    throw Object.assign(new Error('Payroll run not found'), { statusCode: 404 });
  }
  return run;
}

/** Creates a draft run, auto-populating one item per active employee. */
async function createPayrollRun({ organizationId, periodStart, periodEnd }) {
  const start = startOfDayInTz(periodStart);
  const end = startOfDayInTz(periodEnd);
  if (end < start) {
    throw Object.assign(new Error('periodEnd must be after periodStart'), { statusCode: 400 });
  }

  const employees = await prisma.employee.findMany({
    where: { organizationId, employmentStatus: 'active' },
  });

  return prisma.$transaction(async (tx) => {
    const run = await tx.payrollRun.create({
      data: { organizationId, periodStart: start, periodEnd: end, status: 'draft', totalAmount: 0 },
    });

    let total = 0;
    for (const emp of employees) {
      const baseSalary = Number(emp.monthlyCtc || 0);
      const netPay = baseSalary;
      total += netPay;
      await tx.payrollItem.create({
        data: {
          payrollRunId: run.id,
          employeeId: emp.id,
          baseSalary,
          allowances: 0,
          deductions: 0,
          netPay,
        },
      });
    }

    return tx.payrollRun.update({
      where: { id: run.id },
      data: { totalAmount: total },
      include: { items: true },
    });
  });
}

async function updatePayrollItem({ organizationId, itemId, body }) {
  const item = await prisma.payrollItem.findUnique({
    where: { id: itemId },
    include: { payrollRun: true },
  });
  if (!item || item.payrollRun.organizationId !== organizationId) {
    throw Object.assign(new Error('Payroll item not found'), { statusCode: 404 });
  }
  if (item.payrollRun.status !== 'draft') {
    throw Object.assign(new Error('Cannot edit a finalized run'), { statusCode: 400 });
  }

  const baseSalary = Number(body.baseSalary ?? item.baseSalary);
  const allowances = Number(body.allowances ?? item.allowances);
  const deductions = Number(body.deductions ?? item.deductions);
  const netPay = baseSalary + allowances - deductions;

  return prisma.$transaction(async (tx) => {
    const updated = await tx.payrollItem.update({
      where: { id: itemId },
      data: { baseSalary, allowances, deductions, netPay, notes: body.notes ?? item.notes },
    });
    const total = await tx.payrollItem.aggregate({
      where: { payrollRunId: item.payrollRunId },
      _sum: { netPay: true },
    });
    await tx.payrollRun.update({
      where: { id: item.payrollRunId },
      data: { totalAmount: total._sum.netPay || 0 },
    });
    return updated;
  });
}

async function finalizePayrollRun({ organizationId, runId }) {
  const run = await prisma.payrollRun.findFirst({
    where: { id: runId, organizationId },
    include: {
      items: { include: { employee: { include: { user: true } } } },
      organization: true,
    },
  });
  if (!run) {
    throw Object.assign(new Error('Payroll run not found'), { statusCode: 404 });
  }
  if (run.status === 'finalized') {
    throw Object.assign(new Error('Already finalized'), { statusCode: 400 });
  }

  const finalized = await prisma.payrollRun.update({
    where: { id: runId },
    data: { status: 'finalized', finalizedAt: new Date() },
  });

  const periodLabel = `${run.periodStart.toISOString().slice(0, 10)} → ${run.periodEnd.toISOString().slice(0, 10)}`;
  const currency = run.organization.currency || 'INR';
  for (const item of run.items) {
    const email = item.employee?.user?.email;
    if (!email) continue;
    sendPayrollReady({
      to: email,
      fullName: `${item.employee.firstName} ${item.employee.lastName}`.trim(),
      periodLabel,
      netPay: Number(item.netPay).toFixed(2),
      currency,
    });
  }

  return finalized;
}

async function listMyPayslips(employeeId) {
  return prisma.payrollItem.findMany({
    where: { employeeId },
    include: {
      payrollRun: {
        select: { id: true, periodStart: true, periodEnd: true, status: true, finalizedAt: true },
      },
    },
    orderBy: { id: 'desc' },
  });
}

module.exports = {
  listPayrollRuns,
  getPayrollRun,
  createPayrollRun,
  updatePayrollItem,
  finalizePayrollRun,
  listMyPayslips,
};
