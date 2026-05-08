const bcrypt = require('bcrypt');
const { prisma } = require('../config/database');
const { generateEmployeeCode } = require('../lib/identifiers');
const { sendCredentials } = require('../lib/mailer');

const EMPLOYEE_INCLUDE = {
  user: { select: { id: true, email: true, role: true, isActive: true } },
  department: { select: { id: true, name: true } },
  location: { select: { id: true, name: true } },
  shift: { select: { id: true, name: true } },
  manager: { select: { id: true, firstName: true, lastName: true } },
};

function buildEmployeeData(input) {
  return {
    firstName:               input.firstName,
    lastName:                input.lastName,
    employeeCode:            input.employeeCode,
    profilePhotoUrl:         input.profilePhotoUrl ?? null,
    dateOfBirth:             input.dateOfBirth ?? null,
    gender:                  input.gender ?? null,
    bloodGroup:              input.bloodGroup ?? null,
    workEmail:               input.workEmail ?? null,
    workPhone:               input.workPhone ?? null,
    personalEmail:           input.personalEmail ?? null,
    personalPhone:           input.personalPhone ?? null,
    emergencyName:           input.emergencyName ?? null,
    emergencyPhone:          input.emergencyPhone ?? null,
    departmentId:            input.departmentId ?? null,
    locationId:              input.locationId ?? null,
    shiftId:                 input.shiftId ?? null,
    managerId:               input.managerId ?? null,
    designation:             input.designation ?? null,
    employmentType:          input.employmentType ?? 'full_time',
    employmentStatus:        input.employmentStatus ?? 'active',
    dateHired:               input.dateHired ?? new Date(),
    contractedHoursPerWeek:  input.contractedHoursPerWeek ?? 40,
    fte:                     input.fte ?? 1,
    monthlyCtc:              input.monthlyCtc ?? 0,
    bankName:                input.bankName ?? null,
    bankIfsc:                input.bankIfsc ?? null,
    addressLine1:            input.addressLine1 ?? null,
    city:                    input.city ?? null,
    state:                   input.state ?? null,
    postalCode:              input.postalCode ?? null,
    country:                 input.country ?? 'India',
  };
}

async function listEmployees(organizationId) {
  return prisma.employee.findMany({
    where: { organizationId },
    orderBy: { createdAt: 'desc' },
    include: EMPLOYEE_INCLUDE,
  });
}

async function createEmployee({ organizationId, body }) {
  const emailLower = String(body.email).trim().toLowerCase();

  const existing = await prisma.user.findUnique({ where: { email: emailLower } });
  if (existing) {
    throw Object.assign(new Error('Email already exists'), { statusCode: 400 });
  }

  let code = body.employeeCode ? String(body.employeeCode).trim() : '';
  if (code) {
    const conflict = await prisma.employee.findFirst({
      where: { organizationId, employeeCode: code },
    });
    if (conflict) {
      throw Object.assign(new Error('Employee code already exists'), { statusCode: 400 });
    }
  } else {
    code = await generateEmployeeCode(organizationId);
  }

  const passwordHash = await bcrypt.hash(String(body.password), 10);
  const employeeData = buildEmployeeData({
    ...body,
    employeeCode: code,
    workEmail: body.workEmail || emailLower,
  });

  const role = body.role || 'employee';

  const employee = await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: { email: emailLower, passwordHash, role, isActive: true, organizationId },
    });
    return tx.employee.create({
      data: { ...employeeData, organizationId, userId: user.id },
      include: EMPLOYEE_INCLUDE,
    });
  });

  const fullName = `${employee.firstName} ${employee.lastName}`.trim();
  const org = await prisma.organization.findUnique({ where: { id: organizationId } });
  const emailResult = await sendCredentials({
    to: employee.workEmail || emailLower,
    fullName,
    loginEmail: emailLower,
    plainPassword: String(body.password),
    organizationName: org?.name,
    role,
  });

  return { employee, emailResult };
}

async function updateEmployee({ organizationId, employeeId, body }) {
  const existing = await prisma.employee.findFirst({
    where: { id: employeeId, organizationId },
    include: { user: true },
  });
  if (!existing) {
    throw Object.assign(new Error('Employee not found'), { statusCode: 404 });
  }

  if (
    body.employeeCode &&
    String(body.employeeCode).trim() !== String(existing.employeeCode)
  ) {
    const conflict = await prisma.employee.findFirst({
      where: { organizationId, employeeCode: String(body.employeeCode).trim() },
    });
    if (conflict) {
      throw Object.assign(new Error('Employee code already exists'), { statusCode: 400 });
    }
  }

  if (body.email && existing.userId) {
    const emailLower = String(body.email).trim().toLowerCase();
    const emailConflict = await prisma.user.findFirst({
      where: { email: emailLower, NOT: { id: existing.userId } },
    });
    if (emailConflict) {
      throw Object.assign(new Error('Email already exists'), { statusCode: 400 });
    }
  }

  const merged = buildEmployeeData({ ...existing, ...body });

  return prisma.$transaction(async (tx) => {
    if (existing.userId) {
      const userUpdate = {};
      if (body.email) userUpdate.email = String(body.email).trim().toLowerCase();
      if (body.password) userUpdate.passwordHash = await bcrypt.hash(String(body.password), 10);
      if (body.role) userUpdate.role = body.role;
      if (Object.keys(userUpdate).length > 0) {
        await tx.user.update({ where: { id: existing.userId }, data: userUpdate });
      }
    }
    return tx.employee.update({
      where: { id: employeeId },
      data: merged,
      include: EMPLOYEE_INCLUDE,
    });
  });
}

async function deactivateEmployee({ organizationId, employeeId }) {
  const existing = await prisma.employee.findFirst({
    where: { id: employeeId, organizationId },
  });
  if (!existing) {
    throw Object.assign(new Error('Employee not found'), { statusCode: 404 });
  }
  return prisma.$transaction(async (tx) => {
    await tx.employee.update({
      where: { id: employeeId },
      data: { employmentStatus: 'inactive' },
    });
    if (existing.userId) {
      await tx.user.update({
        where: { id: existing.userId },
        data: { isActive: false },
      });
    }
    return { id: employeeId };
  });
}

module.exports = {
  listEmployees,
  createEmployee,
  updateEmployee,
  deactivateEmployee,
  EMPLOYEE_INCLUDE,
};
