import React from "react";
import { cookies, headers } from "next/headers";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { UpgradePageContent, UpgradePageContentProps } from "@/components/upgrade-plan/UpgradePageContent";
import { fetchPlans } from "@/lib/data/plans";
import { getCurrencyInfoFromCountry } from "@/lib/location";
import { auth } from "@clerk/nextjs/server";
import { UserType } from "@/types/userTypes";

async function getCountry() {
  const rawHeaders = await headers();
  const headersObj: Record<string, string> = {};
  for (const [key, value] of rawHeaders.entries()) {
    headersObj[key] = value;
  }
  try {
    const response = await fetch(
      `${process.env.NEXT_PUBLIC_APP_URL}/api/location`,
      {
        headers: headersObj,
      },
    );
    if (!response.ok) {
      throw new Error("Failed to fetch location");
    }
    const data = await response.json();
    return data.country;
  } catch (error) {
    console.error(error);
    return null;
  }
}

async function fetchUserPlanServerSide(userId: string | null) {
  if (!userId) {
    return { userType: null, currentPlan: null };
  }
  try {
    const response = await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/user/plans`, {
      headers: {
        // Pass the user ID to the API route if needed for authentication/authorization
        // This is a simplified example, actual auth might use Clerk's session tokens
        'X-User-ID': userId,
      },
      cache: 'no-store', // Ensure fresh data
    });
    if (!response.ok) {
      throw new Error("Failed to fetch user plan");
    }
    const data = await response.json();
    return {
      userType: data.userType || UserType.Free,
      currentPlan: data.currentPlan ? {
        endDate: data.currentPlan.endDate ? new Date(data.currentPlan.endDate) : null,
        startDate: new Date(data.currentPlan.startDate),
        status: data.currentPlan.status
      } : null
    };
  } catch (error) {
    console.error('Error fetching user plan server-side:', error);
    return { userType: null, currentPlan: null };
  }
}

export default async function UpgradePage({ searchParams }: any) {
  const { userId } = await auth(); // Get user ID server-side

  const cookieStore = await cookies();
  const currencyCookie = cookieStore.get("currency");

  let currency = "USD";
  if (currencyCookie?.value) {
    currency = currencyCookie.value;
  } else {
    const country = await getCountry();
    if (!country) {
      // Could not detect country, defaulting to USD
    }
    const currencyInfo = country ? getCurrencyInfoFromCountry(country) : { currency: "USD" };
    currency = currencyInfo.currency;
  }

  const { plans, success } = await fetchPlans(currency);

  const { userType: currentUserPlan, currentPlan: currentPlanData } = await fetchUserPlanServerSide(userId);

  const upgradePageContentProps: UpgradePageContentProps = {
    initialPlan:
      typeof (await searchParams).plan === "string"
        ? (await searchParams).plan
        : undefined,
    isDevelopment: process.env.NODE_ENV === 'development',
    currentUserPlan,
    currentPlanData,
    plans,
    success,
  };

  return (
    <div className="min-h-screen bg-background relative pt-24">
      <Navbar />
      <UpgradePageContent {...upgradePageContentProps} />
      <Footer />
      {/* Background pattern */}
      <div className="fixed inset-0 -z-20">
        <div className="absolute inset-0 opacity-[0.05] dark:opacity-[0.05]">
          <svg className="w-full h-full">
            <pattern
              id="grid"
              width="32"
              height="32"
              patternUnits="userSpaceOnUse"
            >
              <path
                d="M0 .5H32M.5 0V32"
                fill="none"
                stroke="currentColor"
                strokeWidth="1"
              />
            </pattern>
            <rect width="100%" height="100%" fill="url(#grid)" />
          </svg>
        </div>
      </div>
    </div>
  );
}