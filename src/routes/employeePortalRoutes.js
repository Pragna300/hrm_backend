const { Router } = require('express');
const { verifyJWT } = require('../middleware/auth');
const { rbac } = require('../middleware/rbac');
const { requireTenant } = require('../middleware/tenant');
const ctrl = require('../controllers/employeePortalController');

const router = Router();
router.use(verifyJWT, requireTenant, rbac('anyEmployee'));

router.get('/badges', ctrl.badges);

router.get('/news', ctrl.listNews);
router.post('/news', ctrl.postNews);

router.get('/documents', ctrl.listDocs);
router.post('/documents', ctrl.postDoc);

router.get('/tasks/summary', ctrl.taskSummary);
router.get('/tasks/assignable-employees', ctrl.assignableEmployees);
router.get('/tasks/reporting-managers', ctrl.reportingManagers);
router.get('/tasks', ctrl.listTasks);
router.post('/tasks', ctrl.postTask);
router.patch('/tasks/:id', ctrl.patchTask);
router.delete('/tasks/:id', ctrl.removeTask);

router.get('/org-chart', ctrl.orgChart);

router.get('/profile', ctrl.getProfile);
router.patch('/profile', ctrl.patchProfile);

module.exports = router;
