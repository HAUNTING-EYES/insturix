import React from "react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { DashboardProviders } from "@/components/providers/DashboardProviders";
import { UpgradePageContent } from "@/components/upgrade-plan/UpgradePageContent";

export default async function UpgradePage() {
  return (
    <div className="min-h-screen bg-zinc-950 relative selection:bg-zinc-800 selection:text-white">
      <Navbar />
      <main>
        <DashboardProviders>
          <UpgradePageContent />
        </DashboardProviders>
      </main>
      <Footer />
    </div>
  );
}