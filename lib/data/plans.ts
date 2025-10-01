import { PlansResponse } from "@/schemas/plans";

export { type ClientPlan as Plan } from "@/schemas/plans";
export type { PlansResponse };

import { getPlansForCurrency } from "@/lib/services/planService";

const makeClientPricing = (pricing: any, currency: string) => {
  const { amount, symbol, providerPlanIds } = pricing || {};
  const result: any = { amount, currency, symbol };
  if (providerPlanIds) {
    if (providerPlanIds.razorpay) {
      result.paymentProvider = {
        provider: 'razorpay',
        planId: providerPlanIds.razorpay,
      };
    }
  }
  return result;
};

export const fetchPlans = async (currency: string = "USD"): Promise<PlansResponse> => {
  // Server-side path: use DB helper directly to avoid server->server HTTP calls (can hit Vercel protections)
  if (typeof window === 'undefined') {
    try {
      console.log('[fetchPlans] server - using direct DB helper', { currency });
      const rawPlans = await getPlansForCurrency(currency);
      const formattedPlans = rawPlans.map((plan: any) => ({
        id: plan.id,
        name: plan.name,
        type: plan.type,
        description: plan.description,
        serviceLimits: plan.serviceLimits,
        pricing: {
          monthly: makeClientPricing(plan.pricing?.monthly || {}, currency),
          yearly: makeClientPricing(plan.pricing?.yearly || {}, currency),
        },
        isActive: plan.isActive ?? true,
        sortOrder: plan.sortOrder ?? 0,
      }));

      return {
        success: true,
        plans: formattedPlans,
        currency,
        count: formattedPlans.length,
      };
    } catch (err) {
      console.error('[fetchPlans] server direct DB error', err instanceof Error ? err.message : err);
      throw new Error('Failed to fetch plans');
    }
  }

  // Client-side fallback: perform HTTP fetch to public API
 const baseUrl = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000';

  const requestUrl = `${baseUrl}/api/plans?currency=${currency}`;


  const response = await fetch(requestUrl, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
    },
    cache: 'no-store',
  });

  if (!response.ok) {
    let bodyText = '';
    try {
      bodyText = await response.text();
    } catch (e) {
      bodyText = `unable to read response body: ${e instanceof Error ? e.message : e}`;
    }
    console.error('[fetchPlans] non-ok response', { status: response.status, statusText: response.statusText, bodyText });
    throw new Error('Failed to fetch plans');
  }

 // Check if the response is JSON before parsing to avoid RangeError
 const contentType = response.headers.get('content-type');
  if (!contentType || !contentType.includes('application/json')) {
    const text = await response.text();
    console.error('[fetchPlans] non-JSON response', { contentType, text: text.substring(0, 200) + '...' });
    throw new Error('Invalid response format');
  }

  return response.json();
};