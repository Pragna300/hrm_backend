const { Router } = require('express');
const { verifyJWT } = require('../middleware/auth');
const { rbac } = require('../middleware/rbac');
const { requireTenant } = require('../middleware/tenant');
const { buildHandlers } = require('../controllers/orgStructureController');

function mountEntity(name) {
  const router = Router();
  router.use(verifyJWT, rbac('companyAdmin'), requireTenant);
  const handlers = buildHandlers(name);
  router.get('/', handlers.list);
  router.post('/', handlers.create);
  router.put('/:id', handlers.update);
  router.delete('/:id', handlers.remove);
  return router;
}

module.exports = {
  departmentsRouter: mountEntity('department'),
  locationsRouter: mountEntity('location'),
  shiftsRouter: mountEntity('shift'),
};
