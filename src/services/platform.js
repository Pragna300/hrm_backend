const { prisma } = require('../config/database');

/** Aggregated platform-level KPIs used by the super-admin dashboard. */
async function getPlatformOverview() {
  const [
    orgCount,
    activeOrgs,
    suspendedOrgs,
    cancelledOrgs,
    employeeCount,
    userCount,
    paidInvoiceAgg,
    outstandingInvoices,
    subscriptionRows,
    recentCompanies,
  ] = await Promise.all([
    prisma.organization.count(),
    prisma.organization.count({ where: { status: 'active' } }),
    prisma.organization.count({ where: { status: 'suspended' } }),
    prisma.organization.count({ where: { status: 'cancelled' } }),
    prisma.employee.count(),
    prisma.user.count({ where: { organizationId: { not: null } } }),
    prisma.invoice.aggregate({
      where: { status: 'paid' },
      _sum: { amount: true },
      _count: true,
    }),
    prisma.invoice.aggregate({
      where: { status: 'issued' },
      _sum: { amount: true },
      _count: true,
    }),
    prisma.subscription.groupBy({
      by: ['status'],
      _count: { _all: true },
    }),
    prisma.organization.findMany({
      orderBy: { createdAt: 'desc' },
      take: 6,
      select: {
        id: true,
        name: true,
        slug: true,
        status: true,
        createdAt: true,
        sector: true,
        _count: { select: { employees: true } },
      },
    }),
  ]);

  const activeSubscriptions = await prisma.subscription.findMany({
    where: { status: { in: ['active', 'trialing'] } },
    include: { plan: true },
  });

  const mrr = activeSubscriptions.reduce((sum, sub) => {
    const amount = Number(sub.unitAmount);
    return sum + (sub.billingCycle === 'yearly' ? amount / 12 : amount);
  }, 0);

  const subscriptionsByPlan = {};
  for (const sub of activeSubscriptions) {
    const key = sub.plan.name;
    subscriptionsByPlan[key] = (subscriptionsByPlan[key] || 0) + 1;
  }

  const subscriptionsByStatus = {};
  for (const row of subscriptionRows) {
    subscriptionsByStatus[row.status] = row._count._all;
  }

  return {
    orgCount,
    activeOrgs,
    suspendedOrgs,
    cancelledOrgs,
    employeeCount,
    userCount,
    activeSubscriptions: activeSubscriptions.length,
    mrr: Number(mrr.toFixed(2)),
    paidRevenue: Number(paidInvoiceAgg._sum.amount || 0),
    paidInvoices: paidInvoiceAgg._count,
    outstandingRevenue: Number(outstandingInvoices._sum.amount || 0),
    outstandingInvoices: outstandingInvoices._count,
    subscriptionsByPlan,
    subscriptionsByStatus,
    recentCompanies,
  };
}

async function listOrganizations() {
  return prisma.organization.findMany({
    orderBy: { createdAt: 'desc' },
    include: {
      subscriptions: {
        orderBy: { id: 'desc' },
        take: 1,
        include: { plan: true },
      },
      _count: { select: { employees: true, users: true } },
    },
  });
}

async function setOrganizationStatus({ organizationId, status }) {
  if (!['active', 'suspended', 'cancelled'].includes(status)) {
    throw Object.assign(new Error('Invalid status'), { statusCode: 400 });
  }
  return prisma.organization.update({
    where: { id: organizationId },
    data: { status },
  });
}

/**
 * Permanently removes a tenant organization and cascaded data.
 * Portal users are detached (not deleted) so their email stays reserved; refresh tokens cleared.
 */
async function deleteOrganization({ organizationId, confirmSlug }) {
  const id = Number(organizationId);
  if (!Number.isFinite(id)) {
    throw Object.assign(new Error('Invalid organization id'), { statusCode: 400 });
  }
  const org = await prisma.organization.findUnique({ where: { id } });
  if (!org) {
    throw Object.assign(new Error('Company not found'), { statusCode: 404 });
  }
  const slug = String(confirmSlug || '').trim();
  if (!slug || slug !== org.slug) {
    throw Object.assign(
      new Error('Type the company slug exactly to confirm deletion'),
      { statusCode: 400 }
    );
  }

  await prisma.$transaction(async (tx) => {
    await tx.notification.deleteMany({ where: { organizationId: id } });
    await tx.leaveRequest.updateMany({
      where: { organizationId: id },
      data: { approverId: null },
    });
    await tx.employee.updateMany({
      where: { organizationId: id },
      data: { managerId: null },
    });
    await tx.user.updateMany({
      where: { organizationId: id },
      data: { organizationId: null, refreshToken: null },
    });
    await tx.organization.delete({ where: { id } });
  });

  return { id, slug: org.slug };
}

async function listInvoices() {
  return prisma.invoice.findMany({
    orderBy: { issuedAt: 'desc' },
    include: {
      organization: { select: { id: true, name: true, slug: true } },
    },
  });
}

async function listPlans() {
  return prisma.plan.findMany({ orderBy: { sortOrder: 'asc' } });
}

async function upsertPlan({ id, body }) {
  const data = {
    name: body.name,
    slug: body.slug,
    description: body.description ?? null,
    monthlyPrice: Number(body.monthlyPrice ?? 0),
    yearlyPrice:  Number(body.yearlyPrice ?? 0),
    currency: body.currency || 'USD',
    seatLimit: Number(body.seatLimit ?? 10),
    features: body.features ?? null,
    isActive: body.isActive ?? true,
    isDefault: body.isDefault ?? false,
    sortOrder: Number(body.sortOrder ?? 0),
  };
  if (id) {
    return prisma.plan.update({ where: { id: Number(id) }, data });
  }
  return prisma.plan.create({ data });
}

module.exports = {
  getPlatformOverview,
  listOrganizations,
  setOrganizationStatus,
  deleteOrganization,
  listInvoices,
  listPlans,
  upsertPlan,
};
