"use server";
import Razorpay from 'razorpay';
import {
  lemonSqueezySetup,
  createCheckout as createLemonSqueezyCheckout,
} from '@lemonsqueezy/lemonsqueezy.js';
import dotenv from 'dotenv';
import Plan from '../../schemas/plans.ts';

dotenv.config();

if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_SECRET_KEY_ID) {
  throw new Error("Razorpay credentials are not configured.");
}

if (!process.env.LEMONSQUEEZY_API_KEY || !process.env.LEMONSQUEEZY_STORE_ID) {
    throw new Error("Lemon Squeezy credentials are not configured.");
}

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_SECRET_KEY_ID,
});

const lemonSqueezyProducts: Map<string, string> = new Map();

async function getLemonSqueezyProduct(name: string) {
    if (lemonSqueezyProducts.has(name)) {
        return lemonSqueezyProducts.get(name);
    }
    console.log(`Creating Lemon Squeezy product for ${name}`);
    const product = { id: `ls_prod_${name.replace(/ /g, '_').toLowerCase()}` };
    lemonSqueezyProducts.set(name, product.id);
    return product.id;
}

export async function createPlan(planDetails: {
    name: string;
    amount: number;
    currency: string;
    period: 'monthly' | 'yearly';
    type: string;
}) {
    const { name, amount, currency, period, type } = planDetails;
    // console.log('[DEBUG] createPlan called with:', { name, amount, currency, period, type });
    if (currency === 'INR') {
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
            console.error(`Failed to create Razorpay plan for ${name} in ${currency} (${period}):`, error.error?.description || error);
            return null;
        }
    } else {
        try {
            const productId = await getLemonSqueezyProduct(name);
            console.log(`Creating Lemon Squeezy variant for ${name} - ${currency} (${period})`);
            const variantId = `ls_variant_${name.replace(/ /g, '_').toLowerCase()}_${currency.toLowerCase()}_${period}`;
            return { provider: 'lemonsqueezy', id: variantId };
        } catch (error) {
            console.error(`Failed to create Lemon Squeezy variant for ${name} in ${currency} (${period}):`, error);
            return null;
        }
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
    } else if (selectedProvider === 'lemonsqueezy') {
        // Lemon Squeezy checkout logic
        console.log(`[Checkout] Attempting to use Lemon Squeezy Variant ID: ${selectedPlanId}`);
        
        lemonSqueezySetup({ apiKey: process.env.LEMONSQUEEZY_API_KEY! });

        const { data: checkoutData, error } = await createLemonSqueezyCheckout(
            process.env.LEMONSQUEEZY_STORE_ID!,
            selectedPlanId,
            {
                checkoutData: {
                    email: user.email!,
                    name: user.fullName || "",
                    custom: {
                        user_id: user.id,
                    },
                },
            }
        );

        if (error) {
          console.error('[Lemon Squeezy Checkout Error]', error);
          throw new Error(error.message);
        }

        if (!checkoutData || !checkoutData.data) {
            throw new Error("Failed to create Lemon Squeezy checkout.");
        }

        return {
            provider: 'lemonsqueezy',
            checkoutUrl: checkoutData.data.attributes.url,
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
    if (refundDetails.currency === 'INR') {
        const refund = await razorpay.payments.refund(refundDetails.paymentId, {
            amount: refundDetails.amount,
            notes: refundDetails.notes,
        });
        return { success: true, ...refund };
    } else {
        // Lemon Squeezy refund logic
        return { success: false, error: 'Lemon Squeezy refunds are not yet implemented.' };
    }
}

export async function getRefundStatus(paymentId: string): Promise<any> {
    // Assuming this is for Razorpay, as Lemon Squeezy refund status might be handled differently.
    return await razorpay.payments.fetch(paymentId);
}

export async function verifyPayment(paymentData: any, currency: string) {
    if (currency === 'INR') {
    } else {
    }
}