const Stripe = require('stripe');

// Lazy-init: don't crash at import time if env var is not yet loaded.
// The key is read when the first API call is actually made.
let _stripe = null;
function getStripe() {
  if (!_stripe) {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) throw new Error('STRIPE_SECRET_KEY environment variable is not set');
    _stripe = Stripe(key);
  }
  return _stripe;
}

module.exports = {
  /**
   * Create a new Stripe customer for an organization.
   * @param {Object} params - { email, name, organizationId }
   * @returns {Promise<Object>} Stripe customer object
   */
  async createCustomer({ email, name, organizationId }) {
    const customer = await getStripe().customers.create({
      email,
      name,
      metadata: { organizationId: organizationId.toString() },
    });
    return customer;
  },

  /**
   * Create a subscription for a customer directly (without UI).
   * @param {Object} params - { customerId, priceId, quantity }
   */
  async createSubscription({ customerId, priceId, quantity = 1 }) {
    const subscription = await getStripe().subscriptions.create({
      customer: customerId,
      items: [{ price: priceId, quantity }],
      expand: ['latest_invoice.payment_intent'],
    });
    return subscription;
  },

  /**
   * Create a Stripe Checkout Session for hosted payment.
   */
  async createCheckoutSession({ customerId, plan, successUrl, cancelUrl }) {
    const currency = (plan.currency || 'INR').toLowerCase();

    // payment_method_types for INR: 'card' always works.
    // 'upi' is Stripe's valid identifier for UPI/NetBanking in India.
    // Note: 'netbanking' is NOT a valid Stripe value — use 'upi' instead.
    const paymentMethods = ['card'];
    if (currency === 'inr') paymentMethods.push('upi');

    const session = await getStripe().checkout.sessions.create({
      customer: customerId,
      payment_method_types: paymentMethods,
      line_items: [
        {
          price_data: {
            currency,
            product_data: {
              name: plan.name,
              description: plan.description || `Subscription to ${plan.name} plan`,
            },
            // Stripe expects smallest currency unit: paise for INR
            unit_amount: Math.round(Number(plan.monthlyPrice) * 100),
            recurring: {
              interval: 'month',
            },
          },
          quantity: 1,
        },
      ],
      mode: 'subscription',
      success_url: successUrl,
      cancel_url: cancelUrl,
    });
    return session;
  },

  /**
   * Handle incoming Stripe webhook events.
   * @param {string} rawBody - raw request body
   * @param {string} signature - stripe-signature header
   * @param {function} handler - function to process events
   */
  async handleWebhook(rawBody, signature, handler) {
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!webhookSecret) throw new Error('STRIPE_WEBHOOK_SECRET is not set');
    let event;
    try {
      event = getStripe().webhooks.constructEvent(rawBody, signature, webhookSecret);
    } catch (err) {
      console.error('⚠️ Webhook signature verification failed.', err.message);
      throw err;
    }
    await handler(event);
    return event;
  },

  /**
   * Retrieve a Stripe customer by ID.
   * @param {string} customerId
   */
  async getCustomer(customerId) {
    return await getStripe().customers.retrieve(customerId);
  },

  // Expose the lazy getter for advanced usage
  get stripe() { return getStripe(); },
};
