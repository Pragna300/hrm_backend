const { z } = require('zod');

// Roles that a manager can assign to employees
const ROLES_ASSIGNABLE_BY_MANAGER = ['hr', 'team_lead', 'employee'];
// Roles allowed when updating an employee (manager cannot assign manager role)
const ROLES_ASSIGNABLE_FOR_UPDATE = ['hr', 'team_lead', 'employee'];

// Helper transformers
const optionalDate = z
  .union([z.string(), z.null(), z.undefined()])
  .transform((value) => {
    if (!value) return null;
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  });

const optionalForeignId = z
  .union([z.string(), z.number(), z.null(), z.undefined()])
  .transform((value) => {
    if (value == null || value === '') return null;
    const parsed = Number(value);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
  });

const optionalDecimal = z
  .union([z.string(), z.number(), z.null(), z.undefined()])
  .transform((value) => {
    if (value == null || value === '') return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  });

// Base schema for employee create / update
const employeeBaseSchema = z.object({
  firstName: z.string().min(1, 'First name required'),
  lastName: z.string().min(1, 'Last name required'),
  employeeCode: z.string().optional().nullable(),
  profilePhotoUrl: z.string().optional().nullable(),
  dateOfBirth: optionalDate,
  gender: z.string().optional().nullable(),
  bloodGroup: z.string().optional().nullable(),
  workEmail: z.string().optional().nullable(),
  workPhone: z.string().optional().nullable(),
  personalEmail: z.string().optional().nullable(),
  personalPhone: z.string().optional().nullable(),
  emergencyName: z.string().optional().nullable(),
  emergencyPhone: z.string().optional().nullable(),
  departmentId: optionalForeignId,
  // Allows assigning multiple departments – will be stored in a join table.
  departmentIds: z.array(optionalForeignId).optional(),
  locationId: optionalForeignId,
  shiftId: optionalForeignId,
  managerId: optionalForeignId,
  designation: z.string().optional().nullable(),
  employmentType: z.string().optional().nullable(),
  employmentStatus: z.string().optional().nullable(),
  dateHired: optionalDate,
  contractedHoursPerWeek: optionalDecimal,
  fte: optionalDecimal,
  monthlyCtc: optionalDecimal,
  bankName: z.string().optional().nullable(),
  bankIfsc: z.string().optional().nullable(),
  addressLine1: z.string().optional().nullable(),
  city: z.string().optional().nullable(),
  state: z.string().optional().nullable(),
  postalCode: z.string().optional().nullable(),
  country: z.string().optional().nullable(),
});

// Schema for creating an employee (includes auth fields)
const createEmployeeSchema = employeeBaseSchema.extend({
  email: z.string().email('Valid email required'),
  password: z.string().min(6, 'Password must be at least 6 chars'),
  role: z.enum(ROLES_ASSIGNABLE_BY_MANAGER).optional(),
});

// Schema for updating an employee (all fields optional)
const updateEmployeeSchema = employeeBaseSchema
  .extend({
    email: z.string().email().optional(),
    password: z.string().min(6).optional().or(z.literal('')),
    role: z.enum(ROLES_ASSIGNABLE_FOR_UPDATE).optional(),
  })
  .partial();

module.exports = {
  createEmployeeSchema,
  updateEmployeeSchema,
  ROLES_ASSIGNABLE_BY_MANAGER,
};
