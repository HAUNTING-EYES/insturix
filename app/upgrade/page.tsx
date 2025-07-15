import React from "react";
import { cookies, headers } from "next/headers";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { UpgradePageContent } from "@/components/upgrade-plan/UpgradePageContent";
import { fetchPlans } from "@/lib/data/plans";
import { getCurrencyInfoFromCountry } from "@/lib/location";

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

export default async function UpgradePage({ searchParams }: any) {
  const awaitedSearchParams = await searchParams;
  const initialPlan =
    typeof awaitedSearchParams.plan === "string"
      ? awaitedSearchParams.plan
      : undefined;
  const cookieStore = await cookies();
  const currencyCookie = cookieStore.get("currency");
  let currency = "USD";
  if (currencyCookie?.value) {
    currency = currencyCookie.value;
  } else {
    const country = await getCountry();
    currency = country ? getCurrencyInfoFromCountry(country).currency : "USD";
  }

  const { plans, success } = await fetchPlans(currency);

  return (
    <div className="min-h-screen bg-background relative">
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

      <Navbar />

      <div className="container mx-auto px-4 pt-24 pb-20">
        <UpgradePageContent
          mode="page"
          initialPlan={initialPlan}
          showNavigation={true}
          isDevelopment={process.env.APP_ENV === "development"}
        />
      </div>

      <Footer />
    </div>
  );
}