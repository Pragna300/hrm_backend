const { Router } = require('express');
const { verifyJWT } = require('../middleware/auth');
const { rbac } = require('../middleware/rbac');
const { requireTenant } = require('../middleware/tenant');
const ctrl = require('../controllers/attendanceController');

const router = Router();
router.use(verifyJWT, requireTenant);

router.get('/today', rbac('anyEmployee'), ctrl.today);
router.post('/tap-in', rbac('anyEmployee'), ctrl.tapIn);
router.post('/tap-out', rbac('anyEmployee'), ctrl.tapOut);
router.get('/me/history', rbac('anyEmployee'), ctrl.myHistory);

router.get('/team/today', rbac('staffApprover'), ctrl.teamToday);

module.exports = router;
