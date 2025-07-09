"use server";
import Razorpay from 'razorpay';
import dotenv from 'dotenv';
import Plan from '../../schemas/plans.ts';

dotenv.config();

if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_SECRET_KEY_ID) {
  throw new Error("Razorpay credentials are not configured.");
}


const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_SECRET_KEY_ID,
});


export async function createPlan(planDetails: {
    name: string;
    amount: number;
    currency: string;
    period: 'monthly' | 'yearly';
    type: string;
}) {
    const { name, amount, currency, period, type } = planDetails;
    // console.log('[DEBUG] createPlan called with:', { name, amount, currency, period, type });
    try {
        const razorpayPlan = await razorpay.plans.create({
            period: period,
            interval: 1,
            item: {
                name: `${name} - ${currency} (${period})`,
                amount: Math.round(amount * 100),
                currency: currency,
                description: `${period.charAt(0).toUpperCase() + period.slice(1)} subscription for ${name}`,
            },
            notes: {
                planType: type,
                billingCycle: period,
            },
        });
        return { provider: 'razorpay', id: razorpayPlan.id };
    } catch (error: any) {
        const description = error.error?.description;
        if (typeof description === 'string' && description.trim().toLowerCase() === 'currency provided is not supported') {
            console.error(`Failed to create Razorpay plan for ${name} in ${currency} (${period}): ${description}`);
            console.error(`Suggestion: Please ensure that international payments and the currency '${currency}' are enabled for subscriptions in your Razorpay account settings.`);
        } else {
            console.error(`Failed to create Razorpay plan for ${name} in ${currency} (${period}):`, description || error.message || error);
        }
        return null;
    }
}

export async function createCheckout(
    planType: string,
    user: { id: string; fullName: string | null; email?: string; },
    currency: string,
    billingCycle: 'monthly' | 'yearly',
    paymentProvider?: string,
    paymentPlanId?: string
): Promise<any> {
    console.log(`[Checkout] Starting for plan: ${planType}, currency: ${currency}, cycle: ${billingCycle}, provider: ${paymentProvider}, planId: ${paymentPlanId}`);
    const plan = await Plan.findOne({ type: planType });

    if (!plan) {
        console.error(`[Checkout] Plan not found in DB for type: ${planType}`);
        throw new Error(`Plan not found for type: ${planType}`);
    }

    // Use the provided paymentProvider and paymentPlanId directly
    const selectedProvider = paymentProvider;
    const selectedPlanId = paymentPlanId;

    if (!selectedProvider || !selectedPlanId) {
        console.error(`[Checkout] Payment provider or planId is missing.`);
        throw new Error(`Payment provider or planId not found for plan: ${plan.name}, currency: ${currency}, cycle: ${billingCycle}`);
    }

    if (selectedProvider === 'razorpay') {
        console.log(`[Checkout] Attempting to use Razorpay Plan ID: ${selectedPlanId}`);
        // Razorpay checkout logic
        const subscription = await razorpay.subscriptions.create({
            plan_id: selectedPlanId,
            customer_notify: 1,
            total_count: billingCycle === 'monthly' ? 12 : 1,
            notes: {
              userId: user.id,
              planType: planType,
              billingCycle: billingCycle,
            }
        });
        return {
            provider: 'razorpay',
            key: process.env.RAZORPAY_KEY_ID,
            subscriptionId: subscription.id,
        };
    } else {
        throw new Error(`Unsupported payment provider: ${selectedProvider}`);
    }
}

export async function createRefund(refundDetails: {
    paymentId: string;
    amount?: number;
    reason?: string;
    notes?: Record<string, string>;
    currency: string;
}): Promise<any> {
    const refund = await razorpay.payments.refund(refundDetails.paymentId, {
        amount: refundDetails.amount,
        notes: refundDetails.notes,
    });
    return { success: true, ...refund };
}

export async function getRefundStatus(paymentId: string): Promise<any> {
    // Assuming this is for Razorpay, as Lemon Squeezy refund status might be handled differently.
    return await razorpay.payments.fetch(paymentId);
}

export async function verifyPayment(paymentData: any, currency: string) {
    // Razorpay handles verification via webhooks, so no specific action is needed here.
}