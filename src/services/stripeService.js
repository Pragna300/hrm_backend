const Stripe = require('stripe');
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

module.exports = {
  /**
   * Create a new Stripe customer for an organization.
   * @param {Object} params - { email, name, organizationId }
   * @returns {Promise<Object>} Stripe customer object
   */
  async createCustomer({ email, name, organizationId }) {
    const customer = await stripe.customers.create({
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
    const subscription = await stripe.subscriptions.create({
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
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      payment_method_types: ['card', 'netbanking'],
      line_items: [
        {
          price_data: {
            currency: (plan.currency || 'INR').toLowerCase(),
            product_data: {
              name: plan.name,
              description: plan.description || `Subscription to ${plan.name} plan`,
            },
            unit_amount: Math.round(Number(plan.monthlyPrice) * 100), // Stripe expects amounts in cents/paise
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
    let event;
    try {
      event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
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
    return await stripe.customers.retrieve(customerId);
  },

  // Export the raw Stripe instance for advanced usage if needed
  stripe,
};
