/** Prisma include tree for login / me responses. */
const userWithEmployeeInclude = {
  employee: {
    include: {
      department: { select: { id: true, name: true } },
      location: { select: { id: true, name: true } },
      manager: { select: { firstName: true, lastName: true, employeeCode: true } },
    },
  },
  organization: {
    include: {
      subscriptions: {
        orderBy: { id: 'desc' },
        take: 1,
        include: { plan: true },
      },
    },
  },
};

/** Maps a `User` (with the include above) to the JSON shape consumed by the UI. */
function buildAuthUserPayload(user) {
  const emp = user.employee;
  const nameFromEmployee = emp ? `${emp.firstName} ${emp.lastName}`.trim() : '';
  const name = nameFromEmployee || user.email.split('@')[0] || 'User';
  const subscription = user.organization?.subscriptions?.[0] || null;

  return {
    id: user.id,
    email: user.email,
    role: user.role,
    name,
    employeeId: emp?.id ?? null,
    employeeCode: emp?.employeeCode ?? null,
    designation: emp?.designation ?? null,
    departmentName: emp?.department?.name ?? null,
    locationName: emp?.location?.name ?? null,
    managerName: emp?.manager
      ? `${emp.manager.firstName} ${emp.manager.lastName}`.trim()
      : null,
    workEmail: emp?.workEmail || user.email,
    workPhone: emp?.workPhone || emp?.personalPhone || null,
    profilePhotoUrl: emp?.profilePhotoUrl || null,
    dateHired: emp?.dateHired || null,
    contractedHoursPerWeek: emp?.contractedHoursPerWeek ?? null,
    fte: emp?.fte ?? null,
    personalEmail: emp?.personalEmail || null,
    personalPhone: emp?.personalPhone || null,
    employmentType: emp?.employmentType || null,
    organizationId: user.organizationId ?? null,
    organizationName: user.organization?.name || (user.role === 'super_admin' ? 'Platform Admin' : ''),
    organizationSector: user.organization?.sector || null,
    organizationStatus: user.organization?.status ?? null,
    plan: subscription?.plan ? { name: subscription.plan.name, slug: subscription.plan.slug } : null,
    subscriptionStatus: subscription?.status ?? null,
    hasEmployeeProfile: Boolean(emp),
  };
}

module.exports = { userWithEmployeeInclude, buildAuthUserPayload };
