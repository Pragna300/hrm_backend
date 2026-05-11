const { prisma } = require('../config/database');
const { ok, fail, asyncHandler } = require('../utils/response');

const ENTITIES = {
  department: {
    model: prisma.department,
    fields: ['name', 'parentId', 'isActive'],
  },
  location: {
    model: prisma.location,
    fields: ['name', 'address', 'isActive'],
  },
  shift: {
    model: prisma.shift,
    fields: ['name', 'startTime', 'endTime', 'workDays', 'isDefault'],
  },
};

function pick(body, allowed) {
  const out = {};
  for (const key of allowed) {
    if (body[key] !== undefined) out[key] = body[key];
  }
  return out;
}

function getEntity(name) {
  const entity = ENTITIES[name];
  if (!entity) {
    throw Object.assign(new Error(`Unknown entity: ${name}`), { statusCode: 400 });
  }
  return entity;
}

function buildHandlers(entityName) {
  const entity = getEntity(entityName);

  const list = asyncHandler(async (req, res) => {
    const rows = await entity.model.findMany({
      where: { organizationId: req.organizationId },
      orderBy: { id: 'asc' },
    });
    return ok(res, { data: rows });
  });

  const create = asyncHandler(async (req, res) => {
    const data = pick(req.body, entity.fields);
    if (!data.name) return fail(res, 'name is required');
    if (entityName === 'shift') {
      if (!data.startTime || !data.endTime) {
        return fail(res, 'startTime and endTime are required');
      }
      data.startTime = new Date(`1970-01-01T${data.startTime}:00.000Z`);
      data.endTime = new Date(`1970-01-01T${data.endTime}:00.000Z`);
    }
    const row = await entity.model.create({
      data: { ...data, organizationId: req.organizationId },
    });
    return ok(res, { data: row }, 201);
  });

  const update = asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return fail(res, 'Invalid id', 400);
    const existing = await entity.model.findFirst({
      where: { id, organizationId: req.organizationId },
    });
    if (!existing) return fail(res, 'Not found', 404);

    const data = pick(req.body, entity.fields);
    if (entityName === 'shift') {
      if (data.startTime) data.startTime = new Date(`1970-01-01T${data.startTime}:00.000Z`);
      if (data.endTime)   data.endTime   = new Date(`1970-01-01T${data.endTime}:00.000Z`);
    }
    const row = await entity.model.update({ where: { id }, data });
    return ok(res, { data: row });
  });

  const remove = asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return fail(res, 'Invalid id', 400);
    const existing = await entity.model.findFirst({
      where: { id, organizationId: req.organizationId },
    });
    if (!existing) return fail(res, 'Not found', 404);
    await entity.model.update({ where: { id }, data: { isActive: false } });
    return ok(res, { message: 'Deactivated' });
  });

  return { list, create, update, remove };
}

module.exports = { buildHandlers };
