# Subscription System Setup Guide

This guide outlines the necessary steps to configure and launch the new Razorpay subscription system for your application. Following these steps will ensure that plan creation, user subscriptions, recurring payments, and cancellations work correctly.

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

# Razorpay API Keys
# You can get these from your Razorpay Dashboard > Settings > API Keys
NEXT_PUBLIC_RAZORPAY_KEY_ID=rzp_test_... # Public Key ID
RAZORPAY_SECRET_KEY_ID=your_razorpay_secret # Secret Key

# Razorpay Webhook
# Create a strong secret for webhook verification
RAZORPAY_WEBHOOK_SECRET=your_strong_webhook_secret
```

### 2. Install Dependencies

The system relies on the official Razorpay Node.js library. Install it by running:

```bash
yarn add razorpay
# or
npm install razorpay
```

### 3. Set Up Database Plans

This is a **critical one-time setup step**. The provided script communicates with Razorpay to create subscription plans for each currency defined in your application. It then stores the Razorpay-generated plan IDs in your MongoDB database.

To run the script, execute the following command from your project's root directory:

```bash
node scripts/setupPlans.js
```

You should see output in your console confirming the creation of plans for each currency. Only run this script once, or if you make changes to the pricing or add new plans in `scripts/setupPlans.js`.

### 4. Configure Razorpay Webhooks

The subscription system is event-driven and relies on webhooks from Razorpay to function correctly.

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

### 5. Handling Plan Expirations (Downgrades)

When a user cancels their subscription, it remains active until the end of the billing period. A mechanism is required to downgrade them to the free plan once this period ends.

**Recommendation:** The most robust solution is to enhance the webhook handler to listen for the `subscription.ended` event from Razorpay. This event is sent when a canceled subscription finally expires.

As a safety net, you can also set up a cron job to periodically check for expired plans. Your application already has an endpoint for this at `app/api/cron/check-plan-expiration/route.ts`. You can use a service like [Vercel Cron](https://vercel.com/docs/cron-jobs) or another scheduler to call this endpoint daily.

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

Testing recurring payments is different from testing one-time payments. You must use specific test cards that are enabled for subscriptions.

**A. Test Cards for Subscriptions**

Use the following international test cards to simulate successful subscription creation. The standard `4111...` card **will not work** for recurring payments.

| Card Network      | Card Number         |
| ----------------- | ------------------- |
| **Visa**          | `4242 4242 4242 4242` |
| **Mastercard**    | `5252 5252 5252 5252` |
| **American Express** | `3782 8224 6310 005`  |

*   **Expiry Date**: Use any valid future date (e.g., `12/30`).
*   **CVV**: Use any 3 digits (e.g., `123`).
*   **OTP for Success**: `123456`.

**B. Enabling International Test Cards**

If you get an "International cards are not supported" error when using the test cards above, you must enable international payments on your Razorpay test account.

1.  Log in to your Razorpay Dashboard.
2.  Go to **Account & Settings**.
3.  Find the **International Payments** section and activate it.
4.  If you cannot find this option, you must contact Razorpay support and ask them to enable international payments on your test account.

**C. Enabling UPI AutoPay**

The UPI AutoPay option will not be visible in a standard test account. It requires a fully activated, KYC-compliant Razorpay production account.

Once your account is live and KYC is complete:
1.  Navigate to **Account & Settings** in your Razorpay Dashboard.
2.  Go to the **Payment Methods** section and click on **UPI**.
3.  Ensure that **UPI AutoPay** is enabled.

After enabling it in your live account, it will automatically appear as a payment option for subscriptions without requiring any code changes.

By completing these steps, your new subscription system will be fully operational. 