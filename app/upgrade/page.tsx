import React from "react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { DashboardProviders } from "@/components/providers/DashboardProviders";
import { UpgradePageContent } from "@/components/upgrade-plan/UpgradePageContent";

export default async function UpgradePage() {
  return (
    <div className="min-h-screen bg-background relative pt-24">
      <Navbar />
      <DashboardProviders>
        <UpgradePageContent />
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