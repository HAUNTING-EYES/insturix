"use client";

import { useEffect, useState, Suspense } from "react";
import { useRouter } from "next/navigation";
import CheckoutForm from "./CheckoutForm";

function CheckoutFormLoadingSkeleton() {
  return (
    <div className="rounded-3xl border border-white/10 bg-white/60 dark:bg-zinc-950/60 backdrop-blur-xl p-6">
      <div className="space-y-4">
        <div className="h-6 bg-zinc-200 dark:bg-zinc-800 rounded animate-pulse" />
        <div className="grid grid-cols-2 gap-4">
          <div className="h-24 bg-zinc-200 dark:bg-zinc-800 rounded-xl animate-pulse" />
          <div className="h-24 bg-zinc-200 dark:bg-zinc-800 rounded-xl animate-pulse" />
        </div>
        <div className="h-64 bg-zinc-200 dark:bg-zinc-800 rounded animate-pulse" />
      </div>
    </div>
  );
}

function CheckoutFormContent() {
  const [isLoading, setIsLoading] = useState(true);
  const [isRegistered, setIsRegistered] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const checkRegistration = async () => {
      try {
        const res = await fetch("/api/ics25/attendees", { headers: { accept: "application/json" } });
        if (res.ok) {
          const data = await res.json();
          const attendee = data?.attendee;

          // Bronze and Silver are free, so they don't require paid status
          // Silver requires promotion approval
          if (attendee?.attendeePassTier === 'silver' && attendee?.payment?.status === 'pending') {
            router.push('/checkout/bronze/review');
            return;
          }

          // Bronze doesn't require promotion, so if registered, redirect to confirmation
          if (attendee?.attendeePassTier === 'bronze' && attendee?.payment?.status && attendee?.payment?.status !== 'pending' && attendee?.payment?.status !== 'rejected') {
            setIsRegistered(true);
            router.push("/checkout/ics25/confirmation");
            return;
          }

          // Check if user has upgraded passes or upgrade payments
          const hasUpgradedPass = ['gold', 'platinum', 'creators'].includes(attendee?.attendeePassTier);
          const hasUpgradePayments = attendee?.upgradePayments && Array.isArray(attendee.upgradePayments) && attendee.upgradePayments.length > 0;

          if (attendee?.attendeePassTier && (attendee?.payment?.status === 'paid' || hasUpgradedPass || hasUpgradePayments)) {
            setIsRegistered(true);
            // Redirect to confirmation page
            router.push("/checkout/ics25/confirmation");
            return;
          }
        }
      } catch (e) {
        console.error("Error checking registration:", e);
      } finally {
        setIsLoading(false);
      }
    };

    checkRegistration();
  }, [router]);

  if (isLoading) {
    return <CheckoutFormLoadingSkeleton />;
  }

  if (isRegistered) {
    return <CheckoutFormLoadingSkeleton />; // Show loading while redirecting
  }

  return <CheckoutForm />;
}

export default function CheckoutFormWrapper() {
  return (
    <Suspense fallback={<CheckoutFormLoadingSkeleton />}>
      <CheckoutFormContent />
    </Suspense>
  );
}
