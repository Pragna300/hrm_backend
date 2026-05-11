const express = require('express');
const router = express.Router();
const taskController = require('../controllers/taskController');
const { verifyJWT } = require('../middleware/auth');
const { rbac, ROLE_GROUPS } = require('../middleware/rbac');

// All routes require JWT
router.use(verifyJWT);

const companyTaskAdmins = ['manager', 'hr'];

// Company admins: create/list tasks (legacy `tasks` table)
router.post('/create', rbac(companyTaskAdmins), taskController.createTask);
router.get('/admin', rbac(companyTaskAdmins), taskController.getAdminTasks);

// Anyone with an employee-facing profile in this app
router.get('/my-tasks', rbac(ROLE_GROUPS.anyEmployee), taskController.getEmployeeTasks);

// Shared/Conditional Routes
router.put('/:id/status', taskController.updateTaskStatus);
router.get('/stats', taskController.getDashboardStats);

module.exports = router;
