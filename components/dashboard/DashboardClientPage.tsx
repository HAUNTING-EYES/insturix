"use client";

import { useState } from "react";
import { CreditsCard } from "@/components/shared/CreditsCard";
import { BillingPaymentModal } from "@/components/shared/BillingPaymentModal";
import { DashboardHome } from "./DashboardHome";

export default function DashboardClientPage() {
  const [showTopup, setShowTopup] = useState(false);

  return (
    <>
      <DashboardHome />

      {/* Credits Card - replaces old per-service usage overview */}
      <div className="p-8 pt-4">
        <CreditsCard
          onTopupClick={() => setShowTopup(true)}
          className="max-w-md"
        />
      </div>

      <BillingPaymentModal
        isOpen={showTopup}
        onClose={() => setShowTopup(false)}
      />
    </>
  );
}
