/** Prisma include tree for login /me responses. */
const userWithEmployeeInclude = {
  employee: {
    include: {
      department: { select: { id: true, name: true } },
      location: { select: { id: true, name: true } },
      manager: { select: { firstName: true, lastName: true, employeeCode: true } },
    },
  },
};

/**
 * Maps a User (with employee include) to the JSON shape consumed by the HR portal UI.
 * @param {import('@prisma/client').User & { employee?: object }} user
 */
function buildAuthUserPayload(user) {
  const emp = user.employee;
  const nameFromEmployee = emp ? `${emp.firstName} ${emp.lastName}`.trim() : '';
  const name = nameFromEmployee || user.email.split('@')[0] || 'User';

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
    managerName:
      emp?.manager != null
        ? `${emp.manager.firstName} ${emp.manager.lastName}`.trim()
        : null,
    workEmail: emp?.workEmail || user.email,
    workPhone: emp?.workPhone || emp?.personalPhone || null,
    organizationName: 'SHNOOR International LLC',
    hasEmployeeProfile: Boolean(emp),
  };
}

module.exports = { userWithEmployeeInclude, buildAuthUserPayload };
