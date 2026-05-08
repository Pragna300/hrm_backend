const { Router } = require('express');
const { verifyJWT } = require('../middleware/auth');
const { rbac } = require('../middleware/rbac');
const { requireTenant } = require('../middleware/tenant');
const ctrl = require('../controllers/leaveController');

const router = Router();
router.use(verifyJWT, requireTenant);

// Self-service (anyone with an employee profile)
router.get('/me', rbac('anyEmployee'), ctrl.listMine);
router.get('/me/balances', rbac('anyEmployee'), ctrl.myBalances);
router.post('/me', rbac('anyEmployee'), ctrl.createMine);
router.post('/me/:id/cancel', rbac('anyEmployee'), ctrl.cancelMine);

// Approval / admin
router.get('/types', rbac('anyEmployee'), ctrl.types);
router.post('/types', rbac('companyAdmin'), ctrl.upsertType);
router.put('/types/:id', rbac('companyAdmin'), ctrl.upsertType);

router.get('/', rbac('staffApprover'), ctrl.listAll);
router.post('/:id/decide', rbac('staffApprover'), ctrl.decide);

module.exports = router;
