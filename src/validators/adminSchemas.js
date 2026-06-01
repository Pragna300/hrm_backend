const { z } = require('zod');

// Schema for creating an admin (including super_admin)
// role can be any of the defined Role enum values; defaults to 'super_admin'
const createAdminSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().optional(),
  role: z.enum(['super_admin', 'manager', 'hr', 'team_lead']).optional(),
  organizationId: z.number().int().positive().optional(),
});

module.exports = { createAdminSchema };
