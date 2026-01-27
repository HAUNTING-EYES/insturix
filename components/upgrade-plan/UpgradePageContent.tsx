"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { CheckCircle, Coins, Globe } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { BillingPaymentModal } from "@/components/shared/BillingPaymentModal";
import { CREDIT_PACKAGES, CreditPackage, SUBSCRIPTION_PLANS, SubscriptionPlan } from "@/lib/config/creditCosts";
import { useUser, SignInButton } from "@clerk/nextjs";

export interface UpgradePageContentProps {
  mode?: "popup" | "page";
}

export function UpgradePageContent({
  mode = "page"
}: UpgradePageContentProps) {
  const router = useRouter();
  const { isSignedIn } = useUser();
  const [showTopupModal, setShowTopupModal] = useState(false);
  const [selectedPackage, setSelectedPackage] = useState<CreditPackage | null>(null);
  const [viewMode, setViewMode] = useState<'plans' | 'credits'>('plans');
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'yearly'>('monthly');

  // Need to fetch plans from API since we're using dynamic DB-seeded plans now
  const [plans, setPlans] = useState<any[]>([]);
  const [loadingPlans, setLoadingPlans] = useState(true);

  React.useEffect(() => {
    async function fetchPlans() {
      try {
        const res = await fetch('/api/user/plans');
        const data = await res.json();
        if (data.plans) setPlans(data.plans);
      } catch (e) {
        console.error("Failed to fetch plans", e);
      } finally {
        setLoadingPlans(false);
      }
    }
    fetchPlans();
  }, []);

  const handleSelectPackage = (pkg: CreditPackage) => {
    if (!isSignedIn) return;
    setSelectedPackage(pkg);
    setShowTopupModal(true);
  };
  
  const handleSelectPlan = (planId: string) => {
    if (!isSignedIn) return;
    console.log("Selected plan:", planId);
    // Give immediate visual feedback
    router.push(`/dashboard/billing?upgrade=${planId}`);
  };

  return (
    <div className={cn(
      "w-full max-w-7xl mx-auto px-4 py-12",
      mode === "popup" && "py-4 px-2"
    )}>
      {/* Header Section */}
      <div className="text-center mb-12 relative">
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: "easeOut" }}
          className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/5 border border-white/10 text-[10px] font-bold uppercase tracking-[0.2em] text-white/40 mb-8"
        >
          <span className="w-1 h-1 rounded-full bg-amber-500 animate-pulse" />
          Choose Your Path
        </motion.div>

        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5 }}
          className="mb-6"
        >
          <h1 className="text-5xl md:text-7xl font-black text-white tracking-tighter leading-none mb-4">
            Flexible <span className="text-transparent bg-clip-text bg-gradient-to-b from-white to-white/40">Pricing</span>
          </h1>
        </motion.div>
        
        <p className="text-lg text-white/40 max-w-2xl mx-auto font-medium leading-relaxed mb-8">
          Subscribe for monthly benefits or top-up credits as you go. <br className="hidden md:block" />
          Both in USD. Cancel anytime.
        </p>

        {/* Toggle Switch */}
        <div className="flex justify-center mb-12">
          <div className="bg-white/5 p-1 rounded-xl inline-flex border border-white/10">
            <button
              onClick={() => setViewMode('plans')}
              className={cn(
                "px-6 py-2.5 rounded-lg text-sm font-bold transition-all duration-300",
                viewMode === 'plans' ? "bg-white text-black shadow-lg" : "text-white/40 hover:text-white"
              )}
            >
              Monthly Plans
            </button>
            <button
              onClick={() => setViewMode('credits')}
              className={cn(
                "px-6 py-2.5 rounded-lg text-sm font-bold transition-all duration-300",
                viewMode === 'credits' ? "bg-white text-black shadow-lg" : "text-white/40 hover:text-white"
              )}
            >
              Credit Refills
            </button>
          </div>
        </div>

        {/* Abstract Background Glow for Header */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[300px] bg-amber-500/10 blur-[120px] -z-10 pointer-events-none" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-16">
          {viewMode === 'plans' ? (
            // PLANS VIEW
            SUBSCRIPTION_PLANS.map((plan: SubscriptionPlan) => (
             <Card 
              key={plan.id} 
              className={cn(
                "relative overflow-hidden group cursor-pointer border-white/5 bg-white/[0.03] backdrop-blur-xl hover:border-amber-500/30 transition-all duration-500",
                plan.popular && "border-amber-500/20 bg-amber-500/[0.02]"
              )}
              onClick={() => handleSelectPlan(plan.id)}
            >
                {plan.popular && (
                  <div className="absolute top-4 right-4 text-[8px] font-black px-2 py-0.5 rounded border border-amber-500/50 text-amber-500 uppercase tracking-widest bg-amber-500/5">
                    Recommended
                  </div>
                )}
                
                <CardContent className="p-8">
                  <div className="mb-6">
                    <h3 className="text-xl font-bold text-white mb-2">{plan.name}</h3>
                    <p className="text-xs text-white/40 h-8 line-clamp-2">{plan.description}</p>
                    <div className="flex items-baseline gap-1 mt-4">
                      <span className="text-4xl font-black text-white tracking-tight">${plan.price}</span>
                      <span className="text-sm font-medium text-white/40">/mo</span>
                    </div>
                  </div>

                  <div className="space-y-4 mb-8">
                    <div className="flex items-center gap-3 text-sm text-white/60">
                      <div className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center shrink-0">
                        <span className="text-amber-500 font-bold text-xs">Cr</span>
                      </div>
                      <span className="font-medium text-white">{plan.credits.toLocaleString()} Monthly Credits</span>
                    </div>
                    {plan.features.slice(1).map((feature: string, i: number) => (
                      <div key={i} className="flex items-center gap-3 text-sm text-white/60">
                         <div className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center shrink-0">
                          <CheckCircle className="w-4 h-4 text-white/20" />
                        </div>
                        <span className="font-medium">{feature}</span>
                      </div>
                    ))}
                  </div>

                 {isSignedIn ? (
                    <Button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleSelectPlan(plan.id);
                      }}
                      className={cn(
                        "w-full py-6 text-lg font-bold rounded-xl transition-all duration-300 cursor-pointer pointer-events-auto",
                         plan.popular
                          ? "bg-amber-500 text-black hover:bg-amber-400" 
                          : "bg-white/10 text-white hover:bg-white/20 border border-white/10"
                      )}
                    >
                      Subscribe Now
                    </Button>
                 ) : (
                    <SignInButton mode="modal">
                      <Button className="w-full py-6 text-lg font-bold rounded-xl bg-white/10 text-white hover:bg-white/20 border border-white/10 cursor-pointer pointer-events-auto">
                        Sign in to Subscribe
                      </Button>
                    </SignInButton>
                 )}
                </CardContent>
              </Card>
            ))
          ) : (
            // CREDITS VIEW
            CREDIT_PACKAGES.map((pkg) => (
              <Card key={pkg.id} className={cn(
                "relative overflow-hidden group cursor-pointer border-white/5 bg-white/[0.03] backdrop-blur-xl hover:border-amber-500/30 transition-all duration-500",
                pkg.id === 'topup_500' && "border-amber-500/20 bg-amber-500/[0.02]"
              )}
              onClick={() => handleSelectPackage(pkg)}>
                {pkg.id === 'topup_500' && (
                  <div className="absolute top-4 right-4 text-[8px] font-black px-2 py-0.5 rounded border border-amber-500/50 text-amber-500 uppercase tracking-widest bg-amber-500/5">
                    Recommended
                  </div>
                )}
                
                <CardContent className="p-8 text-left">
                  <div className="mb-6">
                    <h3 className="text-lg font-bold text-white/50 mb-1 group-hover:text-white transition-colors">{pkg.name}</h3>
                    <div className="flex items-baseline gap-2">
                      <span className="text-5xl font-black text-white">{pkg.credits}</span>
                      <span className="text-lg font-bold text-amber-500">Credits</span>
                    </div>
                  </div>

                  <div className="space-y-4 mb-8">
                    <div className="flex items-center gap-3 text-white/70 text-sm">
                      <div className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                      Use for AI Video, Chat & Imaging
                    </div>
                    <div className="flex items-center gap-3 text-white/70 text-sm">
                      <div className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                      Priority processing speed
                    </div>
                    <div className="flex items-center gap-3 text-white/70 text-sm">
                      <div className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                      Credits never expire
                    </div>
                  </div>

                  <div className="mt-auto">
                    <div className="text-3xl font-bold text-white mb-6">
                      ${pkg.prices.USD}
                      <span className="text-sm font-medium text-white/40 ml-2">USD</span>
                    </div>
                    {isSignedIn ? (
                      <Button
                        className={cn(
                          "w-full py-6 text-lg font-bold rounded-xl transition-all duration-300",
                          pkg.id === 'topup_500' 
                            ? "bg-amber-500 text-black hover:bg-amber-400 shadow-[0_0_20px_rgba(245,158,11,0.2)]" 
                            : "bg-white/10 text-white hover:bg-white/20 border border-white/10"
                        )}
                      >
                        Select Package
                      </Button>
                    ) : (
                      <SignInButton mode="modal">
                        <Button
                          className={cn(
                            "w-full py-6 text-lg font-bold rounded-xl transition-all duration-300 cursor-pointer",
                            "bg-white/10 text-white hover:bg-white/20 border border-white/10"
                          )}
                        >
                          Sign in to Purchase
                        </Button>
                      </SignInButton>
                    )}
                  </div>
                </CardContent>
                
                {/* Hover Glow Effect */}
                <div className="absolute inset-0 bg-gradient-to-b from-white/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />
              </Card>
            ))
          )}
      </div>

      <div className="text-center max-w-2xl mx-auto pt-16 border-t border-white/5">
        <h3 className="text-sm font-bold text-white/40 uppercase tracking-[0.2em] mb-6">
          Global Payment Support
        </h3>
        <p className="text-white/30 text-xs leading-relaxed max-w-md mx-auto mb-8">
          Secure international payments powered by Razorpay. We support all major credit cards, debit cards, and digital wallets worldwide. All transactions are securely processed in USD.
        </p>
        <div className="flex justify-center gap-8 grayscale opacity-20 hover:opacity-40 transition-all duration-500">
          <img src="https://upload.wikimedia.org/wikipedia/commons/5/5e/Visa_Inc._logo.svg" alt="Visa" className="h-4" />
          <img src="https://upload.wikimedia.org/wikipedia/commons/2/2a/Mastercard-logo.svg" alt="Mastercard" className="h-4" />
          <img src="https://upload.wikimedia.org/wikipedia/commons/b/b5/PayPal.svg" alt="PayPal" className="h-4" />
        </div>
      </div>

      {/* Credits Top-up Modal */}
      <BillingPaymentModal 
        isOpen={showTopupModal} 
        onClose={() => setShowTopupModal(false)}
        initialPackageId={selectedPackage?.id}
      />
    </div>
  );
}