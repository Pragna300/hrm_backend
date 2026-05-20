const { Router } = require('express');
const { verifyJWT } = require('../middleware/auth');
const { rbac } = require('../middleware/rbac');
const { requireTenant } = require('../middleware/tenant');
const ctrl = require('../controllers/employeeController');

const router = Router();

router.use(verifyJWT, rbac('companyAdmin'), requireTenant);

router.get('/', ctrl.list);
router.post('/', ctrl.create);
router.get('/:id', ctrl.get);
router.put('/:id', ctrl.update);
router.put('/:id/role', ctrl.updateRole);
router.delete('/:id', ctrl.remove);

module.exports = router;
