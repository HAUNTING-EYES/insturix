# Dual Provider Subscription System Setup Guide

This guide outlines the necessary steps to configure and launch the subscription system, which uses **Razorpay for INR payments** and **Lemon Squeezy for all other currencies**. Following these steps will ensure that plan creation, user subscriptions, and webhooks work correctly for both providers.

### 1. Environment Variables

Ensure you have the following environment variables set up in your `.env.local` file (or your hosting provider's environment variable settings).

```sh
# Clerk Authentication
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
CLERK_SECRET_KEY=sk_test_...
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/signin
NEXT_PUBLIC_CLERK_SIGN_UP_URL=/signup

# MongoDB
MONGODB_URI="mongodb+srv://..."

# Razorpay API Keys (for INR payments)
# You can get these from your Razorpay Dashboard > Settings > API Keys
NEXT_PUBLIC_RAZORPAY_KEY_ID=rzp_test_... # Public Key ID
RAZORPAY_SECRET_KEY_ID=your_razorpay_secret # Secret Key

# Razorpay Webhook
# Create a strong secret for webhook verification
RAZORPAY_WEBHOOK_SECRET=your_strong_webhook_secret

# Lemon Squeezy API Keys (for non-INR payments)
# Get these from your Lemon Squeezy Dashboard > Settings > API
LEMONSQUEEZY_API_KEY=your_lemonsqueezy_api_key
LEMONSQUEEZY_STORE_ID=your_store_id # Find this in your Lemon Squeezy store settings

# Lemon Squeezy Webhook
# Create a strong secret for webhook verification in your Lemon Squeezy settings
LEMONSQUEEZY_WEBHOOK_SECRET=your_strong_webhook_secret
```

### 2. Install Dependencies

The system relies on the official SDKs for both payment providers. Install them by running:

```bash
yarn add razorpay lemonsqueezy.ts
# or
npm install razorpay lemonsqueezy.ts
```

### 3. Set Up Database Plans

This is a **critical one-time setup step**. The provided script communicates with both Razorpay and Lemon Squeezy to create subscription plans for each currency defined in your application. It then stores the provider-specific plan IDs in your MongoDB database.

To run the script, execute the following command from your project's root directory:

```bash
node scripts/setupPlans.js
```

You should see output in your console confirming the creation of plans for both providers. Only run this script once, or if you make changes to the pricing or add new plans in `scripts/setupPlans.js`.

### 4. Configure Provider Webhooks

The subscription system is event-driven and relies on webhooks from both providers to function correctly.

#### 4.1 Configure Razorpay Webhooks

1.  **Navigate to your Razorpay Dashboard**.
2.  Go to **Settings** → **Webhooks**.
3.  Click **+ Add New Webhook**.
4.  For the **Webhook URL**, enter your production domain followed by the webhook API route:
    `https://<your-domain>/api/webhooks/razorpay`
5.  For the **Secret**, enter the same value you used for `RAZORPAY_WEBHOOK_SECRET` in your environment variables.
6.  Under **Active Events**, select the following events:
    *   `payment.captured` (Handles the very first payment of a subscription)
    *   `subscription.charged` (Handles all subsequent successful recurring payments)
    *   `subscription.cancelled` (Handles the event when a user cancels their subscription from the Razorpay dashboard)
7.  Click **Create Webhook**.

#### 4.2 Configure Lemon Squeezy Webhooks

1.  **Navigate to your Lemon Squeezy Dashboard**.
2.  Go to **Settings** → **Webhooks**.
3.  Click **+ Create webhook**.
4.  For the **Callback URL**, enter your production domain followed by the webhook API route:
    `https://<your-domain>/api/webhooks/lemonsqueezy`
5.  For the **Signing secret**, enter the same value you used for `LEMONSQUEEZY_WEBHOOK_SECRET` in your environment variables.
6.  Under **Events**, select the `subscription_created` event.
7.  Click **Save webhook**.

### 5. Handling Plan Expirations (Downgrades)

When a user cancels their subscription, it remains active until the end of the billing period. A mechanism is required to downgrade them to the free plan once this period ends.

**Recommendation:** The webhook handlers listen for cancellation events from both providers. As a safety net, you can also set up a cron job to periodically check for expired plans. Your application already has an endpoint for this at `app/api/cron/check-plan-expiration/route.ts`. You can use a service like [Vercel Cron](https://vercel.com/docs/cron-jobs) or another scheduler to call this endpoint daily.

Example Vercel Cron configuration in `vercel.json`:
```json
{
  "crons": [
    {
      "path": "/api/cron/check-plan-expiration",
      "schedule": "0 0 * * *"
    }
  ]
}
```

### 6. Testing Subscriptions

#### 6.1 Testing Razorpay (INR)

Testing recurring payments is different from testing one-time payments. You must use specific test cards that are enabled for subscriptions.

| Card Network      | Card Number         |
| ----------------- | ------------------- |
| **Visa**          | `4242 4242 4242 4242` |
| **Mastercard**    | `5252 5252 5252 5252` |

*   **Expiry Date**: Use any valid future date (e.g., `12/30`).
*   **CVV**: Use any 3 digits (e.g., `123`).
*   **OTP for Success**: `123456`.

If you get an "International cards are not supported" error, you must enable international payments on your Razorpay test account via the dashboard settings.

#### 6.2 Testing Lemon Squeezy (Non-INR)

Lemon Squeezy provides a simple test mode.
1.  In your Lemon Squeezy dashboard, go to **Settings -> General** and ensure **Test mode** is enabled.
2.  When you are redirected to the Lemon Squeezy checkout page, you will see a "Test mode" banner.
3.  Use the provided dummy credit card information to complete a test purchase. No real money will be charged.

By completing these steps, your new dual-provider subscription system will be fully operational.