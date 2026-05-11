const { prisma } = require('../config/database');

/** URL-safe slug from a name (lowercase, `-` separated, ascii). */
function slugify(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || `org-${Date.now()}`;
}

/** Returns a slug guaranteed unique inside the `organization` table. */
async function generateUniqueOrgSlug(name) {
  const base = slugify(name);
  for (let i = 0; i < 5; i += 1) {
    const candidate = i === 0 ? base : `${base}-${i + 1}`;
    const exists = await prisma.organization.findUnique({ where: { slug: candidate } });
    if (!exists) return candidate;
  }
  return `${base}-${Date.now().toString().slice(-5)}`;
}

/**
 * Generates an employee code unique inside one organization.
 * Format: `<prefix><6 random digits>`.
 */
async function generateEmployeeCode(organizationId, prefix = 'EMP') {
  for (let i = 0; i < 5; i += 1) {
    const candidate = `${prefix}${Date.now().toString().slice(-6)}${Math.floor(Math.random() * 90 + 10)}`;
    const exists = await prisma.employee.findFirst({
      where: { organizationId, employeeCode: candidate },
    });
    if (!exists) return candidate;
  }
  return `${prefix}${Date.now()}`;
}

/** Generates a sequential invoice number. */
function buildInvoiceNumber(seed) {
  const yyyy = new Date().getFullYear();
  return `INV-${yyyy}-${String(seed).padStart(6, '0')}`;
}

module.exports = {
  slugify,
  generateUniqueOrgSlug,
  generateEmployeeCode,
  buildInvoiceNumber,
};
