"use server";
import Razorpay from 'razorpay';
import { LemonsqueezyClient } from 'lemonsqueezy.ts';
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

const lemonsqueezy = new LemonsqueezyClient(process.env.LEMONSQUEEZY_API_KEY);

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

export async function createCheckout(planType: string, user: {
    id: string;
    fullName: string | null;
    email?: string;
}, currency: string, billingCycle: 'monthly' | 'yearly'): Promise<any> {
    console.log(`[Checkout] Starting for plan: ${planType}, currency: ${currency}, cycle: ${billingCycle}`);
    const plan = await Plan.findOne({ type: planType });

    if (!plan) {
        console.error(`[Checkout] Plan not found in DB for type: ${planType}`);
        throw new Error(`Plan not found for type: ${planType}`);
    }

    const pricingDetails = plan.pricing[currency]?.[billingCycle];

    console.log('[Checkout] Extracted pricing details:', JSON.stringify(pricingDetails, null, 2));

    if (!pricingDetails || !pricingDetails.planId) {
        console.error(`[Checkout] Pricing details or planId object not found.`);
        throw new Error(`Pricing details or planId not found for plan: ${plan.name}, currency: ${currency}, cycle: ${billingCycle}`);
    }

    if (currency === 'INR') {
        const razorpayPlanId = pricingDetails.planId.get('razorpay');
        console.log(`[Checkout] Attempting to use Razorpay Plan ID: ${razorpayPlanId}`);
        if (!razorpayPlanId) {
            console.error(`[Checkout] Razorpay planId is MISSING from the pricing details!`);
            throw new Error(`Razorpay planId not found for plan: ${plan.name}, currency: ${currency}, cycle: ${billingCycle}`);
        }
        // Razorpay checkout logic
        const subscription = await razorpay.subscriptions.create({
            plan_id: razorpayPlanId,
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
        // Lemon Squeezy checkout logic
        const lemonSqueezyVariantId = pricingDetails.planId.get('lemonsqueezy');
        if (!lemonSqueezyVariantId) {
            console.error(`[Checkout] Lemon Squeezy variantId is MISSING from the pricing details!`);
            throw new Error(`Lemon Squeezy variantId not found for plan: ${plan.name}, currency: ${currency}, cycle: ${billingCycle}`);
        }
        const checkout = await lemonsqueezy.createCheckout({
            store: process.env.LEMONSQUEEZY_STORE_ID!,
            variant: lemonSqueezyVariantId,
            checkout_data: {
                email: user.email,
                name: user.fullName || "",
                custom: {
                    user_id: user.id,
                },
            },
        });
        return {
            provider: 'lemonsqueezy',
            checkoutUrl: checkout.data.attributes.url,
        };
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