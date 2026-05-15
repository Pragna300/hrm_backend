const bcrypt = require('bcrypt');
const { prisma } = require('../config/database');
const { generateUniqueOrgSlug, generateEmployeeCode } = require('../lib/identifiers');
const { ensureLeaveTypesForOrg, getDefaultPlan } = require('../lib/seedPlans');
const { addMonths } = require('../lib/dates');
const { sendCompanyWelcome } = require('../lib/mailer');

/**
 * Provisions a new tenant: organization + manager user + employee record +
 * initial subscription + default leave types. Returns the manager User
 * (with includes) and the freshly created organization.
 */
async function provisionCompany({
  companyName,
  companyAddress,
  sector,
  contactPhone,
  managerName,
  email,
  password,
  planSlug,
  billingCycle = 'monthly',
}) {
  const normalizedEmail = String(email).trim().toLowerCase();
  const existing = await prisma.user.findUnique({ where: { email: normalizedEmail } });
  if (existing) {
    throw Object.assign(new Error('Email already registered'), { statusCode: 400 });
  }

  const passwordHash = await bcrypt.hash(String(password), 10);
  const slug = await generateUniqueOrgSlug(companyName);

  const plan = planSlug
    ? await prisma.plan.findUnique({ where: { slug: planSlug } })
    : await getDefaultPlan();
  const resolvedPlan = plan || (await getDefaultPlan());

  const nameParts = String(managerName).trim().split(/\s+/);
  const firstName = nameParts[0] || 'Manager';
  const lastName = nameParts.slice(1).join(' ') || 'User';

  const now = new Date();
  const periodEnd = addMonths(now, billingCycle === 'yearly' ? 12 : 1);
  const unitAmount = billingCycle === 'yearly' ? resolvedPlan.yearlyPrice : resolvedPlan.monthlyPrice;

  const result = await prisma.$transaction(async (tx) => {
    const organization = await tx.organization.create({
      data: {
        name: companyName,
        slug,
        address: companyAddress || null,
        sector: sector || null,
        contactPhone: contactPhone || null,
        contactEmail: normalizedEmail,
      },
    });

    await tx.subscription.create({
      data: {
        organizationId: organization.id,
        planId: resolvedPlan.id,
        status: Number(unitAmount) === 0 ? 'active' : 'trialing',
        billingCycle,
        unitAmount,
        currency: resolvedPlan.currency,
        startedAt: now,
        currentStart: now,
        currentEnd: periodEnd,
      },
    });

    const employeeCode = await generateEmployeeCode(organization.id, 'MGR', tx);
    const user = await tx.user.create({
      data: {
        email: normalizedEmail,
        passwordHash,
        role: 'manager',
        isActive: true,
        organizationId: organization.id,
        employee: {
          create: {
            organizationId: organization.id,
            employeeCode,
            firstName,
            lastName,
            workEmail: normalizedEmail,
            designation: 'Company Manager',
            dateHired: now,
          },
        },
      },
      include: { employee: true },
    });

    await ensureLeaveTypesForOrg(organization.id, tx);

    return { organization, user };
  }, {
    maxWait: 15000, // Wait for a connection for up to 15s
    timeout: 30000  // Allow the transaction to run for up to 30s
  });

  // Best-effort welcome email — never blocks the request.
  await sendCompanyWelcome({
    to: normalizedEmail,
    companyName: result.organization.name,
    fullName: `${firstName} ${lastName}`.trim(),
  });

  return result;
}

module.exports = { provisionCompany };
