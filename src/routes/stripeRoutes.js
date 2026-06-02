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
  if (!process.env.STRIPE_SECRET_KEY) {
    return res.status(500).json({ error: 'Stripe is not configured on the server.' });
  }
  try {
    const { priceId } = req.body;
    if (!priceId) return res.status(400).json({ error: 'priceId required' });

    const { prisma } = require('../config/database');
    const plan = await prisma.plan.findUnique({ where: { id: Number(priceId) } });
    if (!plan) return res.status(404).json({ error: 'Plan not found' });

    const dbUser = await prisma.user.findUnique({
      where: { id: req.user.userId },
      include: { employee: true },
    });
    if (!dbUser) return res.status(404).json({ error: 'User not found' });

    const name = dbUser.employee
      ? `${dbUser.employee.firstName} ${dbUser.employee.lastName}`.trim()
      : dbUser.email.split('@')[0];

    // Reuse existing Stripe customer for this org if already created
    let stripeCustomerId = null;
    if (dbUser.organizationId) {
      const org = await prisma.organization.findUnique({
        where: { id: dbUser.organizationId },
        select: { stripeCustomerId: true },
      });
      stripeCustomerId = org?.stripeCustomerId || null;
    }

    if (!stripeCustomerId) {
      const customer = await stripeService.createCustomer({
        email: dbUser.email,
        name,
        organizationId: dbUser.organizationId || 1,
      });
      stripeCustomerId = customer.id;

      // Persist the Stripe customer ID on the org so we reuse it next time
      if (dbUser.organizationId) {
        await prisma.organization.update({
          where: { id: dbUser.organizationId },
          data: { stripeCustomerId },
        });
      }
    }

    const origin = req.headers.origin || process.env.FRONTEND_URL || 'http://localhost:5173';

    const session = await stripeService.createCheckoutSession({
      customerId: stripeCustomerId,
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
 * Register this URL in Stripe Dashboard -> Developers -> Webhooks:
 *   https://your-backend.onrender.com/api/stripe/webhook
 * Events to enable: checkout.session.completed
 */
router.post(
  '/webhook',
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

          const amount     = (session.amount_total || 0) / 100;
          const currency   = (session.currency || 'inr').toUpperCase();
          const stripeSubId = session.subscription; // "sub_xxxx" string from Stripe
          const customerId  = session.customer;

          // 1. Get our organizationId from the Stripe customer metadata
          const customer = await stripeService.getCustomer(customerId);
          const orgId = customer?.metadata?.organizationId
            ? Number(customer.metadata.organizationId)
            : null;

          if (!orgId) {
            console.error('Webhook: no organizationId in Stripe customer metadata');
            return;
          }

          // 2. Retrieve full Stripe subscription to get billing period
          const stripeSub = stripeSubId
            ? await stripeService.stripe.subscriptions.retrieve(stripeSubId)
            : null;

          const periodStart = stripeSub
            ? new Date(stripeSub.current_period_start * 1000)
            : new Date(session.created * 1000);
          const periodEnd = stripeSub
            ? new Date(stripeSub.current_period_end * 1000)
            : new Date((session.created + 2592000) * 1000);

          // 3. Match plan by amount to get planId (needed for Subscription FK)
          const matchedPlan = await prisma.plan.findFirst({
            where: {
              monthlyPrice: { gte: amount - 1, lte: amount + 1 },
              currency,
            },
          });
          const planId = matchedPlan?.id || 1;

          // 4. Upsert local Subscription row
          //    Invoice.subscriptionId is a required FK — must exist before creating invoice
          let dbSub = stripeSubId
            ? await prisma.subscription.findFirst({
                where: { stripeSubscriptionId: stripeSubId },
              })
            : null;

          if (!dbSub) {
            dbSub = await prisma.subscription.create({
              data: {
                organizationId: orgId,
                planId,
                stripeSubscriptionId: stripeSubId || null,
                status: 'active',
                billingCycle: 'monthly',
                unitAmount: amount,
                currency,
                currentStart: periodStart,
                currentEnd: periodEnd,
              },
            });
            console.log(`Subscription created in DB: id=${dbSub.id}`);
          } else {
            dbSub = await prisma.subscription.update({
              where: { id: dbSub.id },
              data: { status: 'active', currentStart: periodStart, currentEnd: periodEnd },
            });
          }

          // 5. Create Invoice linked to the subscription (idempotent)
          const invoiceNumber = `inv_${session.id}`;
          const exists = await prisma.invoice.findFirst({ where: { number: invoiceNumber } });

          if (!exists) {
            await prisma.invoice.create({
              data: {
                organizationId: orgId,
                subscriptionId: dbSub.id,
                number: invoiceNumber,
                amount,
                currency,
                status: 'issued',
                periodStart,
                periodEnd,
                issuedAt: new Date(),
                paidAt: new Date(),
              },
            });
            console.log(`Invoice created: ${invoiceNumber} | org=${orgId} | ${currency} ${amount}`);
          } else {
            console.log(`Invoice already exists: ${invoiceNumber}`);
          }
        }
      });

      res.json({ received: true });
    } catch (err) {
      console.error('Stripe webhook error:', err.message);
      res.status(400).send(`Webhook Error: ${err.message}`);
    }
  }
);

module.exports = router;
