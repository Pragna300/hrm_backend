const { Router } = require('express');
const { prisma } = require('../config/database');
const { ok, asyncHandler } = require('../utils/response');
const { ensurePlansSeeded } = require('../lib/seedPlans');

const router = Router();

router.get(
  '/plans',
  asyncHandler(async (_req, res) => {
    await ensurePlansSeeded();
    const plans = await prisma.plan.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: 'asc' },
    });
    return ok(res, { data: plans });
  })
);

module.exports = router;
