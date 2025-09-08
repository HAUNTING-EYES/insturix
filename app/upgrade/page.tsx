import React from "react";
import { cookies, headers } from "next/headers";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { DashboardProviders } from "@/components/providers/DashboardProviders";
import { UpgradePageContent, UpgradePageContentProps } from "@/components/upgrade-plan/UpgradePageContent";
import { fetchPlans } from "@/lib/data/plans";
import { getCurrencyInfoFromCountry } from "@/lib/location";
import { auth } from "@clerk/nextjs/server";
import { UserType } from "@/types/userTypes";
import connectToDatabase from '@/schemas/ConnectToDatabase';
import { User } from '@/schemas/user';
import { getUserPlanWithServiceLimits } from '@/lib/services/planService';

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
    // Instead of calling the internal API (which requires forwarding cookies/headers),
    // query the database directly on the server using the same helpers as the API route.
    await connectToDatabase();
    const user = await User.findOne({ clerkUserId: userId });

    if (!user) {
      return { userType: null, currentPlan: null };
    }

    const userPlanWithServiceLimits = await getUserPlanWithServiceLimits(userId);

    // Build the same simplified shape the client expects
    const currentPlan = userPlanWithServiceLimits ? {
      endDate: userPlanWithServiceLimits.endDate ? new Date(userPlanWithServiceLimits.endDate) : null,
      // UpgradePageContent expects a non-null startDate; fallback to now if missing
      startDate: userPlanWithServiceLimits.startDate ? new Date(userPlanWithServiceLimits.startDate) : new Date(),
      status: userPlanWithServiceLimits.status,
    } : null;

    return {
      userType: user.currentPlan?.name || UserType.Free,
      currentPlan,
    };
  } catch (error) {
    console.error('Error fetching user plan server-side (direct DB):', error instanceof Error ? error.message : error);
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
      <DashboardProviders>
        <UpgradePageContent {...upgradePageContentProps} />
      </DashboardProviders>
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