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

    const origin = req.headers.origin || process.env.FRONTEND_URL || 'http://localhost:5173';

    const session = await stripeService.createCheckoutSession({
      customerId: customer.id,
      plan,
      successUrl: `${origin}/company/billing?success=true`,
      cancelUrl: `${origin}/company/subscription?canceled=true`,
    });

    res.json({ url: session.url });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/stripe/webhook
 *
 * Stripe sends events here. Must use raw body (not JSON-parsed)
 * so the signature can be verified.
 *
 * Register this URL in Stripe Dashboard → Developers → Webhooks:
 *   https://your-backend.onrender.com/api/stripe/webhook
 * Events to enable: checkout.session.completed
 */
router.post(
  '/webhook',
  // IMPORTANT: raw body needed for Stripe signature verification
  express.raw({ type: 'application/json' }),
  async (req, res) => {
    const signature = req.headers['stripe-signature'];
    if (!signature) {
      return res.status(400).send('Missing stripe-signature header');
    }

    try {
      await stripeService.handleWebhook(req.body, signature, async (event) => {
        const { prisma } = require('../config/database');

        if (event.type === 'checkout.session.completed') {
          const session = event.data.object;

          const amount = (session.amount_total || 0) / 100;
          const currency = (session.currency || 'usd').toUpperCase();
          const stripeSubId = session.subscription || null;
          const customerId = session.customer;

          // Retrieve customer to get the organizationId we stored in metadata
          const customer = await stripeService.getCustomer(customerId);
          const orgId = customer?.metadata?.organizationId
            ? Number(customer.metadata.organizationId)
            : null;

          // Create an Invoice record (uses your existing Invoice model)
          await prisma.invoice.create({
            data: {
              organizationId: orgId,
              subscriptionId: stripeSubId ? Number(stripeSubId) : undefined,
              number: `inv_${session.id}`,
              amount,
              currency,
              status: 'issued',
              periodStart: new Date(session.created * 1000),
              periodEnd: new Date((session.created + 2592000) * 1000), // +30 days
              issuedAt: new Date(),
            },
          });

          console.log(`✅ Invoice created for org ${orgId}, amount: ${currency} ${amount}`);
        }

        // Add more event handlers below as needed:
        // if (event.type === 'invoice.payment_failed') { ... }
        // if (event.type === 'customer.subscription.updated') { ... }
      });

      res.json({ received: true });
    } catch (err) {
      console.error('⚠️ Stripe webhook error:', err.message);
      res.status(400).send(`Webhook Error: ${err.message}`);
    }
  }
);

module.exports = router;
