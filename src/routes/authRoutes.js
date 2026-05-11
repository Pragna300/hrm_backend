const { Router } = require('express');
const { verifyJWT } = require('../middleware/auth');
const ctrl = require('../controllers/authController');

const router = Router();

router.post('/register', ctrl.registerCompany);
router.post('/login', ctrl.login);
router.get('/me', verifyJWT, ctrl.me);
router.post('/bootstrap-super-admin', ctrl.bootstrapSuperAdmin);

module.exports = router;
