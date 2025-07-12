import React from "react";
import { cookies } from "next/headers";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { UpgradePageContent } from "@/components/upgrade-plan/UpgradePageContent";
export default async function UpgradePage({ searchParams }: any) {
  const awaitedSearchParams = searchParams;
  const initialPlan =
    typeof awaitedSearchParams.plan === "string"
      ? awaitedSearchParams.plan
      : undefined;

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