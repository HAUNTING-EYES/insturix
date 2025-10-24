"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useToast } from "@/hooks/use-toast";
import CheckoutForm from "./CheckoutForm";
import CreatorSocialLinksForm from "./CreatorSocialLinksForm";
import { Loader2 } from "lucide-react";

export default function CreatorPassManager() {
  const [loading, setLoading] = useState(true);
  const [creatorStatus, setCreatorStatus] = useState<'not_submitted' | 'pending' | 'approved' | 'rejected' | null>(null);
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();

  useEffect(() => {
    const checkCreatorStatus = async () => {
      try {
        setLoading(true);
        
        // Check if user has selected creators tier
        const tier = searchParams?.get("tier");
        if (tier !== "creators") {
          // Not a creator pass selection, show regular checkout
          setCreatorStatus('approved'); // Show regular form
          return;
        }

        // Fetch creator approval status
        const res = await fetch("/api/ics25/creator-approval");
        if (!res.ok) {
          if (res.status === 401) {
            router.push("/signin?redirect_url=/checkout?tier=creators");
            return;
          }
          throw new Error("Failed to fetch creator status");
        }

        const data = await res.json();
        const status = data.status || 'not_submitted';
        setCreatorStatus(status);

        // Handle different states
        if (status === 'pending') {
          // Redirect to review page
          router.push("/checkout/creator/review");
        } else if (status === 'rejected') {
          // Redirect to rejection page
          router.push("/checkout/creator/rejected");
        } else if (status === 'approved') {
          // Allow checkout - will show regular checkout form
          // Do nothing, let component render
        } else {
          // not_submitted - show social links form
          // Do nothing, let component render
        }
      } catch (error: any) {
        toast({
          title: "Error",
          description: error?.message || "Failed to check creator status",
          variant: "destructive" as any,
        });
      } finally {
        setLoading(false);
      }
    };

    checkCreatorStatus();
  }, [searchParams, router, toast]);

  if (loading) {
    return (
      <div className="rounded-3xl border border-white/10 bg-white/60 dark:bg-zinc-950/60 backdrop-blur-xl p-12">
        <div className="flex flex-col items-center justify-center space-y-4">
          <Loader2 className="w-8 h-8 animate-spin text-sky-500" />
          <p className="text-zinc-600 dark:text-zinc-400">Loading...</p>
        </div>
      </div>
    );
  }

  // Show social links form if creator hasn't submitted
  if (creatorStatus === 'not_submitted') {
    return <CreatorSocialLinksForm />;
  }

  // Show regular checkout form for approved creators or non-creator tiers
  if (creatorStatus === 'approved' || creatorStatus === null) {
    return <CheckoutForm />;
  }

  // For pending and rejected, we already redirected above
  // But as fallback, show loading
  return (
    <div className="rounded-3xl border border-white/10 bg-white/60 dark:bg-zinc-950/60 backdrop-blur-xl p-12">
      <div className="flex flex-col items-center justify-center space-y-4">
        <Loader2 className="w-8 h-8 animate-spin text-sky-500" />
        <p className="text-zinc-600 dark:text-zinc-400">Redirecting...</p>
      </div>
    </div>
  );
}
