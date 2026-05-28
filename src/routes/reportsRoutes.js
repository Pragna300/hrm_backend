const { Router } = require('express');
const { verifyJWT } = require('../middleware/auth');
const { rbac } = require('../middleware/rbac');
const { requireTenant } = require('../middleware/tenant');
const ctrl = require('../controllers/reportsController');
const regCtrl = require('../controllers/registrationReportsController');

const router = Router();

// Registration Reports: accessible to super_admin only
router.get('/registrations/overview', verifyJWT, rbac('superAdmin'), requireTenant, regCtrl.getOverview);
router.get('/registrations/charts', verifyJWT, rbac('superAdmin'), requireTenant, regCtrl.getCharts);
router.get('/registrations/table', verifyJWT, rbac('superAdmin'), requireTenant, regCtrl.getTable);
router.get('/registrations/financials', verifyJWT, rbac('superAdmin'), requireTenant, regCtrl.getFinancials);
router.get('/registrations/export', verifyJWT, rbac('superAdmin'), requireTenant, regCtrl.exportExcel);


// Original reports routes (company manager/hr only)
router.use(verifyJWT, rbac('companyAdmin'), requireTenant);

router.get('/attendance', ctrl.getAttendanceOverview);
router.post('/attendance', ctrl.generateReport);
router.get('/attendance/export', ctrl.exportCsv);
router.get('/day-summary', ctrl.getDayWiseSummary);
router.get('/departments', ctrl.getDepartmentsReport);
router.get('/departments/:departmentId', ctrl.getDepartmentEmployees);

module.exports = router;


