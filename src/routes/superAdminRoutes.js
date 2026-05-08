const { Router } = require('express');
const { verifyJWT } = require('../middleware/auth');
const { rbac } = require('../middleware/rbac');
const ctrl = require('../controllers/superAdminController');

const router = Router();
router.use(verifyJWT, rbac('superAdmin'));

router.get('/overview', ctrl.overview);
router.get('/companies', ctrl.companies);
router.put('/companies/:id/status', ctrl.updateCompanyStatus);
router.delete('/companies/:id', ctrl.deleteCompany);

router.get('/invoices', ctrl.invoices);

router.get('/plans', ctrl.plans);
router.post('/plans', ctrl.upsertPlan);
router.put('/plans/:id', ctrl.upsertPlan);

module.exports = router;
