const { Router } = require('express');
const { verifyJWT } = require('../middleware/auth');
const { rbac } = require('../middleware/rbac');
const { requireTenant } = require('../middleware/tenant');
const ctrl = require('../controllers/reportsController');

const router = Router();

router.use(verifyJWT, rbac('companyAdmin'), requireTenant);

router.get('/attendance', ctrl.getAttendanceOverview);
router.post('/attendance', ctrl.generateReport);
router.get('/attendance/export', ctrl.exportCsv);
router.get('/day-summary', ctrl.getDayWiseSummary);
router.get('/departments', ctrl.getDepartmentsReport);
router.get('/departments/:departmentId', ctrl.getDepartmentEmployees);

module.exports = router;

