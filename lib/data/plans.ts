import { PlansResponse } from "@/schemas/plans";

export { type ClientPlan as Plan } from "@/schemas/plans";
export type { PlansResponse };

export const fetchPlans = async (currency: string = "USD"): Promise<PlansResponse> => {
  const baseUrl = process.env.NODE_ENV === 'development'
    ? process.env.NEXT_PUBLIC_VERCEL_URL || 'http://localhost:3000'
    : process.env.NEXT_PUBLIC_APP_URL;

  const response = await fetch(`${baseUrl}/api/plans?currency=${currency}`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
    },
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error('Failed to fetch plans');
  }

  return response.json();
};