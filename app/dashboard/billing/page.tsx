"use client";

import { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { useCredits } from "@/hooks/useCredits";
import { BillingPaymentModal } from "@/components/shared/BillingPaymentModal";
import { ReceiptTape } from "@/components/dashboard/Billing";
import { SUBSCRIPTION_PLANS } from "@/lib/config/creditCosts";

interface CurrentPlan {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  price: number;
  currency: string;
  status: string;
}

export default function BillingPage() {
  const { balance, transactions, isLoading, error, invalidateCredits } = useCredits();
  const [showTopupModal, setShowTopupModal] = useState(false);
  const [currentPlan, setCurrentPlan] = useState<CurrentPlan | null>(null);
  const [planLoading, setPlanLoading] = useState(true);
  const searchParams = useSearchParams();
  const upgradePlanId = searchParams.get("upgrade");

  useEffect(() => {
    if (upgradePlanId) {
      setShowTopupModal(true);
    }
  }, [upgradePlanId]);

  // Fetch current plan
  useEffect(() => {
    async function fetchPlan() {
      try {
        const res = await fetch("/api/user/plans");
        const data = await res.json();
        if (data.currentPlan) {
          setCurrentPlan(data.currentPlan);
        }
      } catch (err) {
        console.error("Failed to fetch plan:", err);
      } finally {
        setPlanLoading(false);
      }
    }
    fetchPlan();
  }, []);

  // Derive plan credits from SUBSCRIPTION_PLANS config
  const planCredits = currentPlan
    ? SUBSCRIPTION_PLANS.find(
        (p) => p.id === currentPlan.id || p.name.toLowerCase() === currentPlan.name.toLowerCase()
      )?.credits
    : undefined;

  /* ── Loading skeleton: receipt-shaped ── */
  if (isLoading || planLoading) {
    return (
      <div className="w-full max-w-[640px] mx-auto px-6 py-12">
        <div className="flex justify-center mb-6">
          <div className="h-7 w-28 rounded-full bg-[#1C1B19] animate-pulse" />
        </div>
        <div className="bg-[#131312] rounded-sm overflow-hidden">
          {/* Scanline texture hint */}
          <div className="px-6 py-6 space-y-4">
            <div className="flex justify-center">
              <div className="h-6 w-32 rounded bg-[#1C1B19] animate-pulse" />
            </div>
            <div className="h-3 w-24 mx-auto rounded bg-[#1C1B19] animate-pulse" />
            <div className="border-t border-dashed border-[#282724] my-3" />
            <div className="h-3 w-32 rounded bg-[#1C1B19] animate-pulse" />
            {[...Array(4)].map((_, i) => (
              <div key={i} className="flex justify-between items-center">
                <div className="h-3 w-28 rounded bg-[#1C1B19] animate-pulse" />
                <div className="h-3 w-10 rounded bg-[#1C1B19] animate-pulse" />
              </div>
            ))}
            <div className="border-t border-dashed border-[#282724] my-3" />
            <div className="flex justify-between items-center">
              <div className="h-4 w-16 rounded bg-[#1C1B19] animate-pulse" />
              <div className="h-8 w-20 rounded bg-[#1C1B19] animate-pulse" />
            </div>
            <div className="flex justify-center py-4">
              <div className="h-10 w-[200px] rounded bg-[#1C1B19] animate-pulse" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  /* ── Error state: receipt-themed ── */
  if (error || !balance) {
    return (
      <div className="w-full max-w-[640px] mx-auto px-6 py-12">
        <div className="bg-[#131312] border border-[#282724] rounded-sm px-6 py-10 text-center">
          <p
            className="text-[14px] font-bold uppercase tracking-[0.12em] text-[#D46A5C] mb-2"
            style={{ fontFamily: "'JetBrains Mono', monospace" }}
          >
            RECEIPT ERROR
          </p>
          <p
            className="text-[12px] text-[#7A776E] mb-6"
            style={{ fontFamily: "'JetBrains Mono', monospace" }}
          >
            {error || "Failed to load billing data"}
          </p>
          <button
            onClick={() => invalidateCredits()}
            className="px-6 py-2.5 rounded-lg text-[12px] font-bold uppercase tracking-[0.12em] transition-all"
            style={{
              fontFamily: "'JetBrains Mono', monospace",
              background: "transparent",
              color: "#D4A652",
              border: "1.5px solid rgba(212,166,82,0.4)",
            }}
          >
            RETRY
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className="min-h-screen"
      style={{ background: "#0B0B0A" }}
    >
      {/* Receipt Tape */}
      <ReceiptTape
        plan={
          currentPlan
            ? {
                name: currentPlan.name,
                price: currentPlan.price,
                credits: planCredits,
              }
            : null
        }
        balance={balance}
        transactions={transactions}
        onTopup={() => setShowTopupModal(true)}
      />

      {/* Top-up / Subscription Modal — unchanged */}
      <BillingPaymentModal
        isOpen={showTopupModal}
        onClose={() => {
          setShowTopupModal(false);
          if (upgradePlanId) {
            window.history.replaceState({}, "", "/dashboard/billing");
          }
        }}
        initialPackageId={upgradePlanId}
        onSuccess={() => {
          invalidateCredits();
          fetch("/api/user/plans")
            .then((res) => res.json())
            .then((data) => {
              if (data.currentPlan) setCurrentPlan(data.currentPlan);
            });
        }}
      />
    </div>
  );
}
