const express = require('express');
const router = express.Router();
const taskController = require('../controllers/taskController');
const { verifyJWT } = require('../middleware/auth');
const { rbac } = require('../middleware/rbac');

// All routes require JWT
router.use(verifyJWT);

// Admin Specific Routes
router.post('/create', rbac('admin'), taskController.createTask);
router.get('/admin', rbac('admin'), taskController.getAdminTasks);

// Employee Specific Routes
router.get('/my-tasks', rbac('employee'), taskController.getEmployeeTasks);

// Shared/Conditional Routes
router.put('/:id/status', taskController.updateTaskStatus);
router.get('/stats', taskController.getDashboardStats);

module.exports = router;
