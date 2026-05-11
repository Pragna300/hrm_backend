const { Router } = require('express');
const { verifyJWT } = require('../middleware/auth');
const { rbac } = require('../middleware/rbac');
const { requireTenant } = require('../middleware/tenant');
const ctrl = require('../controllers/payrollController');

const router = Router();
router.use(verifyJWT, requireTenant);

router.get('/me', rbac('anyEmployee'), ctrl.myPayslips);

router.get('/', rbac('companyAdmin'), ctrl.list);
router.post('/', rbac('companyAdmin'), ctrl.create);
router.get('/:id', rbac('companyAdmin'), ctrl.detail);
router.put('/items/:itemId', rbac('companyAdmin'), ctrl.updateItem);
router.post('/:id/finalize', rbac('companyAdmin'), ctrl.finalize);

module.exports = router;
