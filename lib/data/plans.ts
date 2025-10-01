import { PlansResponse } from "@/schemas/plans";

export { type ClientPlan as Plan } from "@/schemas/plans";
export type { PlansResponse };

export const fetchPlans = async (currency: string = "USD"): Promise<PlansResponse> => {
  const baseUrl = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000';
  const requestUrl = `${baseUrl}/api/plans?currency=${currency}`;

  console.log('[fetchPlans] server - request', { baseUrl, requestUrl, currency });

  const response = await fetch(requestUrl, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
    },
    cache: 'no-store',
  });

  if (!response.ok) {
    // attempt to read response text for richer logs
    let bodyText = '';
    try {
      bodyText = await response.text();
    } catch (e) {
      bodyText = `unable to read response body: ${e instanceof Error ? e.message : e}`;
    }
    console.error('[fetchPlans] non-ok response', { status: response.status, statusText: response.statusText, bodyText });
    throw new Error('Failed to fetch plans');
  }

  return response.json();
};