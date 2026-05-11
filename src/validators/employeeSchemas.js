const { z } = require('zod');

const ROLES_ASSIGNABLE_BY_MANAGER = ['hr', 'team_lead', 'employee'];

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
    if (!Number.isInteger(parsed) || parsed <= 0) return null;
    return parsed;
  });

const optionalDecimal = z
  .union([z.string(), z.number(), z.null(), z.undefined()])
  .transform((value) => {
    if (value == null || value === '') return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  });

const employeeBaseSchema = z.object({
  firstName:               z.string().min(1, 'First name required'),
  lastName:                z.string().min(1, 'Last name required'),
  employeeCode:            z.string().optional().nullable(),
  profilePhotoUrl:         z.string().optional().nullable(),
  dateOfBirth:             optionalDate,
  gender:                  z.string().optional().nullable(),
  bloodGroup:              z.string().optional().nullable(),
  workEmail:               z.string().optional().nullable(),
  workPhone:               z.string().optional().nullable(),
  personalEmail:           z.string().optional().nullable(),
  personalPhone:           z.string().optional().nullable(),
  emergencyName:           z.string().optional().nullable(),
  emergencyPhone:          z.string().optional().nullable(),
  departmentId:            optionalForeignId,
  locationId:              optionalForeignId,
  shiftId:                 optionalForeignId,
  managerId:               optionalForeignId,
  designation:             z.string().optional().nullable(),
  employmentType:          z.string().optional().nullable(),
  employmentStatus:        z.string().optional().nullable(),
  dateHired:               optionalDate,
  contractedHoursPerWeek:  optionalDecimal,
  fte:                     optionalDecimal,
  monthlyCtc:              optionalDecimal,
  bankName:                z.string().optional().nullable(),
  bankIfsc:                z.string().optional().nullable(),
  addressLine1:            z.string().optional().nullable(),
  city:                    z.string().optional().nullable(),
  state:                   z.string().optional().nullable(),
  postalCode:              z.string().optional().nullable(),
  country:                 z.string().optional().nullable(),
});

const createEmployeeSchema = employeeBaseSchema.extend({
  email:    z.string().email('Valid email required'),
  password: z.string().min(6, 'Password must be at least 6 chars'),
  role:     z.enum(ROLES_ASSIGNABLE_BY_MANAGER).optional(),
});

const updateEmployeeSchema = employeeBaseSchema
  .extend({
    email:    z.string().email().optional(),
    password: z.string().min(6).optional().or(z.literal('')),
    role:     z.enum(ROLES_ASSIGNABLE_BY_MANAGER).optional(),
  })
  .partial();

module.exports = {
  createEmployeeSchema,
  updateEmployeeSchema,
  ROLES_ASSIGNABLE_BY_MANAGER,
};
