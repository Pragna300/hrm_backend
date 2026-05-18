const express = require('express');
const router = express.Router();
const notificationCtrl = require('../controllers/notificationController');
const { verifyJWT } = require('../middleware/auth');

router.use(verifyJWT);
router.get('/', notificationCtrl.list);
router.get('/unread-count', notificationCtrl.unreadCount);
router.post('/create', notificationCtrl.create);
router.put('/read/:id', notificationCtrl.markAsRead);
router.put('/read-all', notificationCtrl.markAllAsRead);
router.delete('/:id', notificationCtrl.remove);

module.exports = router;
