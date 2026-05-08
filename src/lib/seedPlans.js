const { prisma } = require('../config/database');

const DEFAULT_PLANS = [
  {
    name: 'Free',
    slug: 'free',
    description: 'Try the platform with up to 5 employees.',
    monthlyPrice: 0,
    yearlyPrice: 0,
    seatLimit: 5,
    features: 'Attendance, Leaves, Basic Reports',
    isDefault: true,
    sortOrder: 1,
  },
  {
    name: 'Starter',
    slug: 'starter',
    description: 'For small teams getting serious about HR.',
    monthlyPrice: 29,
    yearlyPrice: 290,
    seatLimit: 25,
    features: 'Free + Payroll runs, Announcements, Holidays',
    sortOrder: 2,
  },
  {
    name: 'Pro',
    slug: 'pro',
    description: 'Growing companies with multi-department needs.',
    monthlyPrice: 79,
    yearlyPrice: 790,
    seatLimit: 100,
    features: 'Starter + Multi-location, Department hierarchy, Advanced reports',
    sortOrder: 3,
  },
  {
    name: 'Enterprise',
    slug: 'enterprise',
    description: 'Unlimited seats with priority support.',
    monthlyPrice: 199,
    yearlyPrice: 1990,
    seatLimit: 100000,
    features: 'Pro + Custom workflows, Audit log, SSO ready',
    sortOrder: 4,
  },
];

const DEFAULT_LEAVE_TYPES = [
  { name: 'Casual Leave', code: 'CL', yearlyQuota: 12, isPaid: true,  colorHex: '#3174ad' },
  { name: 'Sick Leave',   code: 'SL', yearlyQuota: 8,  isPaid: true,  colorHex: '#10b981' },
  { name: 'Earned Leave', code: 'EL', yearlyQuota: 15, isPaid: true,  colorHex: '#f59e0b' },
  { name: 'Loss Of Pay',  code: 'LOP', yearlyQuota: 0, isPaid: false, colorHex: '#ef4444' },
];

async function ensurePlansSeeded() {
  for (const plan of DEFAULT_PLANS) {
    await prisma.plan.upsert({
      where: { slug: plan.slug },
      update: { ...plan },
      create: { ...plan },
    });
  }
  return prisma.plan.findMany({ orderBy: { sortOrder: 'asc' } });
}

async function getDefaultPlan() {
  const plans = await ensurePlansSeeded();
  return plans.find((p) => p.isDefault) || plans[0];
}

async function ensureLeaveTypesForOrg(organizationId, tx = prisma) {
  for (const type of DEFAULT_LEAVE_TYPES) {
    await tx.leaveType.upsert({
      where: { organizationId_code: { organizationId, code: type.code } },
      update: { ...type, organizationId },
      create: { ...type, organizationId },
    });
  }
}

module.exports = {
  ensurePlansSeeded,
  getDefaultPlan,
  ensureLeaveTypesForOrg,
  DEFAULT_PLANS,
  DEFAULT_LEAVE_TYPES,
};
