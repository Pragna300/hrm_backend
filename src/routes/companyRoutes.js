const { Router } = require('express');
const { prisma } = require('../config/database');
const { verifyJWT } = require('../middleware/auth');
const { rbac } = require('../middleware/rbac');
const { requireTenant } = require('../middleware/tenant');
const { ok, asyncHandler } = require('../utils/response');
const ctrl = require('../controllers/companyController');

const router = Router();
router.use(verifyJWT, requireTenant);

// Public-ish: announcements & plan list visible to anyone in the company.
router.get('/announcements', rbac('anyEmployee'), ctrl.listAnnouncements);
router.get(
  '/plans',
  rbac('anyEmployee'),
  asyncHandler(async (_req, res) => {
    const plans = await prisma.plan.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: 'asc' },
    });
    return ok(res, { data: plans });
  })
);

// Manager / HR
router.get('/overview', rbac('companyAdmin'), ctrl.overview);
router.get('/settings', rbac('companyAdmin'), ctrl.settings);
router.put('/settings', rbac('managerOnly'), ctrl.updateSettings);

router.post('/announcements', rbac('companyAdmin'), ctrl.upsertAnnouncement);
router.put('/announcements/:id', rbac('companyAdmin'), ctrl.upsertAnnouncement);
router.delete('/announcements/:id', rbac('companyAdmin'), ctrl.deleteAnnouncement);

router.get('/holidays', rbac('anyEmployee'), ctrl.listHolidays);
router.post('/holidays', rbac('companyAdmin'), ctrl.upsertHoliday);
router.put('/holidays/:id', rbac('companyAdmin'), ctrl.upsertHoliday);
router.delete('/holidays/:id', rbac('companyAdmin'), ctrl.deleteHoliday);

router.get('/billing', rbac('managerOnly'), ctrl.billing);

module.exports = router;
