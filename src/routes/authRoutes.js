const { Router } = require('express');
const { verifyJWT } = require('../middleware/auth');
const ctrl = require('../controllers/authController');
const adminCtrl = require('../controllers/adminController');
const { rbac } = require('../middleware/rbac');

const router = Router();

router.post('/register', ctrl.registerCompany);
router.post('/login', ctrl.login);
router.get('/me', verifyJWT, ctrl.me);
router.post('/forgot-password', ctrl.forgotPassword);
router.post('/reset-password', ctrl.resetPassword);
router.post('/bootstrap-super-admin', ctrl.bootstrapSuperAdmin);

// New admin creation endpoint (restricted to super admins)
router.post('/admin/create', verifyJWT, rbac('superAdmin'), adminCtrl.adminCreate);

module.exports = router;
