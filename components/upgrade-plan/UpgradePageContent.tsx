"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { CheckCircle, Coins, Globe, ArrowRight, Check } from "lucide-react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { BillingPaymentModal } from "@/components/shared/BillingPaymentModal";
import { CREDIT_PACKAGES, CreditPackage, SUBSCRIPTION_PLANS, SubscriptionPlan } from "@/lib/config/creditCosts";
import { normalizePlanKey } from "@/lib/config/plan-limits";
import { useUser, SignInButton } from "@clerk/nextjs";
import { ScannerDivider } from "@/components/ui/ScannerDivider";

const ease = [0.16, 1, 0.3, 1] as [number, number, number, number];

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
  // The user's current plan key (normalized, e.g. "agency_scale"). currentPlan.name
  // holds the UserType value; normalize so it matches SUBSCRIPTION_PLANS ids.
  const [currentPlanKey, setCurrentPlanKey] = useState<string | null>(null);

  React.useEffect(() => {
    async function fetchPlans() {
      try {
        const res = await fetch('/api/user/plans');
        const data = await res.json();
        if (data.plans) setPlans(data.plans);
        if (data.currentPlan?.name) setCurrentPlanKey(normalizePlanKey(data.currentPlan.name));
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
      "w-full max-w-7xl mx-auto px-4 py-24",
      mode === "popup" && "py-4 px-2"
    )}>
      {/* Header Section — staggered entrance */}
      <motion.div
        initial="hidden"
        animate="show"
        variants={{
          hidden: {},
          show: { transition: { staggerChildren: 0.1 } },
        }}
        className="text-center mb-16 relative"
      >
        <motion.div
          variants={{ hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0, transition: { duration: 0.4, ease } } }}
          className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-zinc-900 border border-zinc-800 text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500 mb-8"
        >
          <span className="w-1 h-1 rounded-full bg-zinc-500 animate-pulse" />
          The Operating System for Content
        </motion.div>

        <motion.div
          variants={{ hidden: { opacity: 0, y: 20 }, show: { opacity: 1, y: 0, transition: { duration: 0.5, ease } } }}
          className="mb-6"
        >
          <h1 className="text-[44px] md:text-7xl font-bold text-white tracking-tighter leading-none mb-4 font-space-grotesk">
            Scale your <span className="text-zinc-500">production.</span>
          </h1>
        </motion.div>
        
        <motion.p
          variants={{ hidden: { opacity: 0, y: 15 }, show: { opacity: 1, y: 0, transition: { duration: 0.4, ease } } }}
          className="text-lg text-zinc-400 max-w-2xl mx-auto font-medium leading-relaxed mb-12 font-inter"
        >
          Subscribe for monthly orchestration benefits or top-up credits as you go. 
          Professional tools for professional creators.
        </motion.p>

        {/* Toggle Switch — Minimal Studio Style */}
        <motion.div 
          variants={{ hidden: { opacity: 0, scale: 0.95 }, show: { opacity: 1, scale: 1, transition: { duration: 0.4, ease } } }}
          className="flex justify-center mb-12"
        >
          <div className="bg-zinc-900 p-1 rounded-xl inline-flex border border-zinc-800">
            <button
              onClick={() => setViewMode('plans')}
              className={cn(
                "px-6 py-2.5 rounded-lg text-sm font-semibold transition-all duration-300 font-inter",
                viewMode === 'plans' ? "bg-white text-zinc-950 shadow-lg" : "text-zinc-500 hover:text-zinc-300"
              )}
            >
              Subscription Plans
            </button>
            <button
              onClick={() => setViewMode('credits')}
              className={cn(
                "px-6 py-2.5 rounded-lg text-sm font-semibold transition-all duration-300 font-inter",
                viewMode === 'credits' ? "bg-white text-zinc-950 shadow-lg" : "text-zinc-500 hover:text-zinc-300"
              )}
            >
              Credit Top-ups
            </button>
          </div>
        </motion.div>

        {/* Abstract Background Glow for Header */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[300px] bg-zinc-500/5 blur-[120px] -z-10 pointer-events-none" />
      </motion.div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8 mb-16 mx-auto">
          {viewMode === 'plans' ? (
            <>
              {/* PLANS VIEW — Staggered and monochrome */}
              {SUBSCRIPTION_PLANS.map((plan: SubscriptionPlan, i: number) => {
              const isCurrent = !!currentPlanKey && normalizePlanKey(plan.id) === currentPlanKey;
              return (
             <motion.div
              key={plan.id}
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: i * 0.1, ease }}
              whileHover={{ y: -8, transition: { duration: 0.3, ease: "easeOut" } }}
              className={cn(
                "relative p-8 rounded-2xl flex flex-col transition-shadow border min-h-[500px]",
                plan.popular
                  ? "bg-zinc-900 border-white/20 shadow-xl hover:shadow-2xl hover:shadow-white/5"
                  : "bg-zinc-900/50 border-zinc-800 hover:shadow-xl hover:shadow-white/[0.02]"
              )}
              onClick={() => handleSelectPlan(plan.id)}
            >
                {plan.popular && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.5, y: 10 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    transition={{ duration: 0.5, delay: 0.4 + i * 0.1, type: "spring", stiffness: 300 }}
                    className="absolute -top-3 left-1/2 -translate-x-1/2 bg-white text-zinc-950 text-[10px] uppercase font-bold tracking-widest px-4 py-1 rounded-full whitespace-nowrap"
                  >
                    Recommended Choice
                  </motion.div>
                )}

                {isCurrent && (
                  <div className="absolute top-4 right-4 bg-emerald-500/15 text-emerald-400 text-[10px] uppercase font-bold tracking-widest px-2.5 py-1 rounded-full">
                    Current
                  </div>
                )}

                <div className="mb-6">
                  <h3 className="text-[18px] font-bold text-white mb-2 font-space-grotesk">{plan.name}</h3>
                  <div className="flex items-baseline gap-1 mt-4">
                    <span className="text-[44px] font-bold text-white tracking-tight">${plan.price}</span>
                    <span className="text-sm font-medium text-zinc-500">/mo</span>
                  </div>
                  <p className="text-sm text-zinc-500 mt-4 font-inter leading-relaxed">{plan.description}</p>
                </div>

                <ul className="space-y-4 mb-8 flex-1">
                  <motion.li
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.3, delay: 0.3 + i * 0.1, ease }}
                    className="flex items-center gap-3 text-sm text-zinc-300"
                  >
                    <div className="w-5 h-5 rounded-full bg-zinc-800 flex items-center justify-center shrink-0">
                      <Check className="w-3 h-3 text-emerald-500" />
                    </div>
                    <span className="font-semibold text-white">{plan.credits.toLocaleString()} Credits</span>
                  </motion.li>
                  {plan.features.slice(1).map((feature: string, fi: number) => (
                    <motion.li
                      key={fi}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.3, delay: 0.3 + i * 0.1 + (fi + 1) * 0.05, ease }}
                      className="flex items-center gap-3 text-sm text-zinc-400"
                    >
                      <Check className="w-4 h-4 text-zinc-700 shrink-0" />
                      <span className="font-medium">{feature}</span>
                    </motion.li>
                  ))}
                </ul>

                 {isCurrent ? (
                    <button
                      disabled
                      onClick={(e) => e.stopPropagation()}
                      className="w-full py-4 text-sm font-bold rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 flex items-center justify-center gap-2 cursor-default"
                    >
                      <Check className="w-4 h-4" />
                      Current Plan
                    </button>
                 ) : isSignedIn ? (
                    <motion.button
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleSelectPlan(plan.id);
                      }}
                      className={cn(
                        "w-full py-4 text-sm font-bold rounded-xl transition-all duration-300 flex items-center justify-center gap-2",
                         plan.popular
                          ? "bg-white text-zinc-950 hover:bg-zinc-100"
                          : "bg-zinc-800 text-white hover:bg-zinc-700 border border-zinc-700"
                      )}
                    >
                      Subscribe Now
                      <ArrowRight className="w-4 h-4" />
                    </motion.button>
                 ) : (
                    <SignInButton mode="modal">
                      <motion.button
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        className="w-full py-4 text-sm font-bold rounded-xl bg-zinc-800 text-white hover:bg-zinc-700 border border-zinc-700 flex items-center justify-center gap-2"
                      >
                        Sign in to Subscribe
                        <ArrowRight className="w-4 h-4" />
                      </motion.button>
                    </SignInButton>
                 )}
              </motion.div>
              );
              })}

            {/* Enterprise Card */}
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 3 * 0.1, ease }}
              whileHover={{ y: -8, transition: { duration: 0.3, ease: "easeOut" } }}
              className="relative p-8 rounded-2xl flex flex-col transition-shadow border min-h-[500px] bg-zinc-900/30 border-dashed border-zinc-700 hover:border-zinc-500 hover:shadow-xl hover:shadow-white/[0.02]"
            >
              <div className="mb-6">
                <h3 className="text-[18px] font-bold text-white mb-2 font-space-grotesk">Enterprise</h3>
                <div className="flex items-baseline gap-1 mt-4">
                  <span className="text-[44px] font-bold text-white tracking-tight">Custom</span>
                </div>
                <p className="text-sm text-zinc-500 mt-4 font-inter leading-relaxed">For large scale agencies and enterprises needing custom solutions.</p>
              </div>

              <ul className="space-y-4 mb-8 flex-1">
                <li className="flex items-center gap-3 text-sm text-zinc-300">
                  <div className="w-5 h-5 rounded-full bg-zinc-800 flex items-center justify-center shrink-0">
                    <Check className="w-3 h-3 text-emerald-500" />
                  </div>
                  <span className="font-semibold text-white">Custom Credits</span>
                </li>
                {[
                  'Dedicated account manager',
                  'SLA & Priority Support',
                  'White-glove setup',
                  'Custom billing & APIs'
                ].map((feature, fi) => (
                  <li key={fi} className="flex items-center gap-3 text-sm text-zinc-400">
                    <Check className="w-4 h-4 text-zinc-700 shrink-0" />
                    <span className="font-medium">{feature}</span>
                  </li>
                ))}
              </ul>

              <Link href="mailto:support@insturix.com" className="w-full">
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  className="w-full py-4 text-sm font-bold rounded-xl bg-transparent text-white border border-zinc-700 hover:bg-white/5 flex items-center justify-center gap-2"
                >
                  Contact Us
                  <ArrowRight className="w-4 h-4" />
                </motion.button>
              </Link>
            </motion.div>
          </>
          ) : (
            // CREDITS VIEW — Staggered and technical
            CREDIT_PACKAGES.map((pkg, i) => (
              <motion.div
                key={pkg.id}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.5, delay: i * 0.1, ease }}
                whileHover={{ y: -8, transition: { duration: 0.3, ease: "easeOut" } }}
                className={cn(
                  "relative p-8 rounded-2xl flex flex-col transition-shadow border min-h-[500px]",
                  pkg.id === 'topup_500'
                    ? "bg-zinc-900 border-white/20 shadow-xl hover:shadow-2xl hover:shadow-white/5"
                    : "bg-zinc-900/50 border-zinc-800 hover:shadow-xl hover:shadow-white/[0.02]"
                )}
                onClick={() => handleSelectPackage(pkg)}
              >
                {pkg.id === 'topup_500' && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.5, y: 10 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    transition={{ duration: 0.5, delay: 0.4 + i * 0.1, type: "spring", stiffness: 300 }}
                    className="absolute -top-3 left-1/2 -translate-x-1/2 bg-white text-zinc-950 text-[10px] uppercase font-bold tracking-widest px-4 py-1 rounded-full whitespace-nowrap"
                  >
                    Recommended Refill
                  </motion.div>
                )}
                
                <div className="mb-6">
                  <h3 className="text-lg font-bold text-zinc-500 mb-1 font-inter uppercase tracking-widest">{pkg.name}</h3>
                  <div className="flex items-baseline gap-2 mt-4">
                    <span className="text-[44px] font-bold text-white font-space-grotesk">{pkg.credits}</span>
                    <span className="text-lg font-bold text-zinc-400 font-inter">Credits</span>
                  </div>
                </div>

                <div className="space-y-4 mb-8 flex-1">
                  {['Use for AI Video, Chat & Imaging', 'Priority processing speed', 'Credits never expire'].map((feature, fi) => (
                    <motion.div
                      key={fi}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.3, delay: 0.3 + i * 0.1 + (fi + 1) * 0.05, ease }}
                      className="flex items-center gap-3 text-zinc-400 text-sm font-inter"
                    >
                      <div className="h-1.5 w-1.5 rounded-full bg-zinc-700" />
                      {feature}
                    </motion.div>
                  ))}
                </div>

                <div className="mt-auto">
                  <div className="text-[32px] font-bold text-white mb-6 font-space-grotesk">
                    ${pkg.prices.USD}
                    <span className="text-sm font-medium text-zinc-500 ml-2">USD</span>
                  </div>
                  {isSignedIn ? (
                    <motion.button
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      className={cn(
                        "w-full py-4 text-sm font-bold rounded-xl transition-all duration-300 flex items-center justify-center gap-2",
                        pkg.id === 'topup_500' 
                          ? "bg-white text-zinc-950 hover:bg-zinc-100" 
                          : "bg-zinc-800 text-white hover:bg-zinc-700 border border-zinc-700"
                      )}
                    >
                      Select Package
                      <ArrowRight className="w-4 h-4" />
                    </motion.button>
                  ) : (
                    <SignInButton mode="modal">
                      <motion.button
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        className="w-full py-4 text-sm font-bold rounded-xl bg-zinc-800 text-white hover:bg-zinc-700 border border-zinc-700 flex items-center justify-center gap-2"
                      >
                        Sign in to Purchase
                        <ArrowRight className="w-4 h-4" />
                      </motion.button>
                    </SignInButton>
                  )}
                </div>
              </motion.div>
            ))
          )}
      </div>

      <ScannerDivider />

      <div className="text-center max-w-2xl mx-auto pt-16">
        <h3 className="text-[11px] font-bold text-zinc-500 uppercase tracking-[0.2em] mb-6 font-inter">
          Global Payment Support
        </h3>
        <p className="text-zinc-500 text-[11px] leading-relaxed max-w-md mx-auto mb-10 font-inter">
          Secure international payments powered by Razorpay. We support all major credit cards, debit cards, and digital wallets worldwide. All transactions are securely processed in USD.
        </p>
        <div className="flex justify-center items-center gap-10 grayscale opacity-20 hover:opacity-100 transition-all duration-700">
          <img src="https://upload.wikimedia.org/wikipedia/commons/9/98/Visa_Inc._logo_%282005%E2%80%932014%29.svg" alt="Visa" className="h-6 md:h-8" />
          <img src="https://upload.wikimedia.org/wikipedia/commons/2/2a/Mastercard-logo.svg" alt="Mastercard" className="h-8 md:h-10" />
          <img src="https://upload.wikimedia.org/wikipedia/commons/b/b5/PayPal.svg" alt="PayPal" className="h-6 md:h-8" />
          <img src="/razorpay.svg" alt="Razorpay" className="h-6 md:h-8 invert" />
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