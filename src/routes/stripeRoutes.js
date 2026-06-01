const express = require('express');
const stripeService = require('../services/stripeService');
const { verifyJWT } = require('../middleware/auth');

const router = express.Router();

/**
 * POST /api/stripe/create-checkout-session
 * Body: { priceId }
 * Returns: { url }
 */
router.post('/create-checkout-session', verifyJWT, async (req, res, next) => {
  try {
    const { priceId } = req.body;
    if (!priceId) return res.status(400).json({ error: 'priceId required' });

    const { prisma } = require('../config/database');
    const plan = await prisma.plan.findUnique({ where: { id: Number(priceId) } });
    if (!plan) return res.status(404).json({ error: 'Plan not found' });

    // Look up the actual user details from the database using JWT payload
    const dbUser = await prisma.user.findUnique({
      where: { id: req.user.userId },
      include: { employee: true },
    });
    if (!dbUser) return res.status(404).json({ error: 'User not found' });

    const name = dbUser.employee
      ? `${dbUser.employee.firstName} ${dbUser.employee.lastName}`.trim()
      : dbUser.email.split('@')[0];

    const customer = await stripeService.createCustomer({
      email: dbUser.email,
      name,
      organizationId: dbUser.organizationId || 1,
    });

    const session = await stripeService.createCheckoutSession({
      customerId: customer.id,
      plan,
      successUrl: `${req.headers.origin}/company/billing?success=true`,
      cancelUrl: `${req.headers.origin}/company/subscription?canceled=true`,
    });

    res.json({ url: session.url });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
