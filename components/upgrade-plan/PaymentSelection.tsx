"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Check, Sparkles, Info, Gift, AlignEndHorizontal } from "lucide-react";
import type { Plan } from "./UpgradePageContent";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useCurrency } from "@/lib/CurrencyContext";
import { cn } from "@/lib/utils";
import { UserType } from "@/types/userTypes";
import { PLAN_THEME, getGradientClass } from "@/lib/themeConfig";

interface PlanSelectionProps {
  plans: Plan[];
  selectedPlan: Plan | null;
  onSelectPlan: (plan: Plan) => void;
  billingCycle: "monthly" | "yearly";
  onBillingCycleChange: (cycle: "monthly" | "yearly") => void;
  currentUserPlan?: import("@/types/userTypes").UserType | null;
  currentPlanData?: {
    endDate: Date | null;
    startDate: Date;
    status: string;
  } | null;
}

// Service limits data structure
const serviceLimits = {
  [UserType.Free]: {
    alyzitron: { analyses: 12, overTwentyMins: 4 },
    clickatron: { thumbnails: 12 },
    editron: { edits: 1 },
    socialize: { links: 5, oneTime: true },
    musitron: { tracks: 8 },
    thinkforge: { sessions: 10 },
    shield: { applications: 1 }
  },
  [UserType.Plus]: {
    alyzitron: { analyses: 60, overTwentyMins: 20 },
    clickatron: { thumbnails: 60 },
    editron: { edits: 10 },
    socialize: { links: "Unlimited" },
    musitron: { tracks: 40 },
    thinkforge: { sessions: 25 },
    shield: { applications: 3 }
  },
  [UserType.Pro]: {
    alyzitron: { analyses: 200, overTwentyMins: 80 },
    clickatron: { thumbnails: 120 },
    editron: { edits: 25 },
    socialize: { links: "Unlimited" },
    musitron: { tracks: 100 },
    thinkforge: { sessions: 100 },
    shield: { applications: 3 }
  },
  [UserType.Premium]: {
    alyzitron: { analyses: "Unlimited", fairUsage: true },
    clickatron: { thumbnails: "Unlimited", fairUsage: true },
    editron: { edits: 40 },
    socialize: { links: "Unlimited" },
    musitron: { tracks: 160 },
    thinkforge: { sessions: "Unlimited", fairUsage: true },
    shield: { applications: 3 }
  }
};

// Creator perks data structure
const creatorPerks = {
  [UserType.Free]: {
    prioritySupport: false,
    earlyAccess: false,
    creatorCommunities: false,
    creatorEvents: false,
    weeklyMixers: false,
    successManager: false,
    creatorCohorts: false
  },
  [UserType.Plus]: {
    prioritySupport: false,
    earlyAccess: false,
    creatorCommunities: false,
    creatorEvents: false,
    weeklyMixers: false,
    successManager: false,
    creatorCohorts: false
  },
  [UserType.Pro]: {
    prioritySupport: true,
    earlyAccess: true,
    creatorCommunities: true,
    creatorEvents: true,
    weeklyMixers: false,
    successManager: false,
    creatorCohorts: true
  },
  [UserType.Premium]: {
    prioritySupport: true,
    earlyAccess: true,
    creatorCommunities: true,
    creatorEvents: true,
    weeklyMixers: true,
    successManager: true,
    creatorCohorts: true
  }
};

const serviceRows = [
  {
    name: "Alyzitron",
    description: "(Video Analysis)",
    key: "alyzitron",
    formatter: (limits: any) => 
      limits?.analyses === "Unlimited" 
        ? "✅ Unlimited (Fair usage)"
        : `${limits?.analyses || 0} analyses${limits?.overTwentyMins ? `, ${limits.overTwentyMins} over 20 mins` : ""}`
  },
  {
    name: "Clickatron",
    description: "(Thumbnail Gen)",
    key: "clickatron", 
    formatter: (limits: any) =>
      limits?.thumbnails === "Unlimited"
        ? "✅ Unlimited (Fair usage)"
        : `${limits?.thumbnails || 0} thumbnails`
  },
  {
    name: "Editron",
    description: "(AI Video Edits)",
    key: "editron",
    formatter: (limits: any) => `${limits?.edits || 0} edits`
  },
  {
    name: "Socialize",
    description: "(Smart Links Page)", 
    key: "socialize",
    formatter: (limits: any) =>
      limits?.links === "Unlimited"
        ? "✅ Unlimited links"
        : `${limits?.links || 0} links${limits?.oneTime ? " (one-time)" : ""}`
  },
  {
    name: "Musitron",
    description: "(AI Music Tracks)",
    key: "musitron",
    formatter: (limits: any) => `${limits?.tracks || 0} tracks`
  },
  {
    name: "ThinkForge", 
    description: "(Content Ideation)",
    key: "thinkforge",
    formatter: (limits: any) =>
      limits?.sessions === "Unlimited"
        ? "✅ Unlimited (Fair usage)"
        : `${limits?.sessions || 0} sessions`
  },
  {
    name: "Shield",
    description: "(Protection Applications)",
    key: "shield", 
    formatter: (limits: any) => `${limits?.applications || 0}/month`
  }
];

const perkRows = [
  { name: "Priority Customer Support", key: "prioritySupport" },
  { name: "Early Access to New Tools", key: "earlyAccess" },
  { name: "Invite-Only Creator Communities", key: "creatorCommunities" },
  { name: "Access to Creator Events", key: "creatorEvents" },
  { name: "Weekly Mixers & Leisure Sessions", key: "weeklyMixers", note: "(Subject to approval)" },
  { name: "Dedicated Success Manager", key: "successManager" },
  { name: "Creator Cohorts (Growth Circles)", key: "creatorCohorts" }
];

// Define plan hierarchy for upgrade/downgrade logic
const getPlanTier = (planType: UserType): number => {
  switch (planType) {
    case UserType.Free: return 0;
    case UserType.Plus: return 1;
    case UserType.Pro: return 2;
    case UserType.Premium: return 3;
    default: return 0;
  }
};

const isDowngrade = (fromPlan: UserType, toPlan: UserType): boolean => {
  return getPlanTier(fromPlan) > getPlanTier(toPlan);
};

const isUpgrade = (fromPlan: UserType, toPlan: UserType): boolean => {
  return getPlanTier(fromPlan) < getPlanTier(toPlan);
};

export function PlanSelection({
  plans,
  selectedPlan,
  onSelectPlan,
  billingCycle,
  onBillingCycleChange,
  currentUserPlan,
  currentPlanData,
}: PlanSelectionProps) {
  const { selectedSymbol } = useCurrency()
  const [hoveredPlan, setHoveredPlan] = useState<string | null>(null);

  const formatEndDate = (endDate: Date | null) => {
    if (!endDate) return "Lifetime";
    return new Date(endDate).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  const handleBillingToggle = () => {
    onBillingCycleChange(billingCycle === "monthly" ? "yearly" : "monthly");
  };

  // Animation variants - reduced delays for immediate feel
  const cardVariants = {
    initial: { opacity: 0, y: 10 },
    animate: (index: number) => ({
      opacity: 1,
      y: 0,
      transition: {
        delay: 0.02 * index, // Reduced delay
        duration: 0.3, // Faster animation
        ease: "easeOut" as any,
      },
    }),
    hover: {
      y: -10,
      transition: {
        duration: 0.3,
        ease: "easeOut" as any,
      },
    },
    tap: {
      y: -5,
      transition: {
        duration: 0.1,
        ease: "easeOut" as any,
      },
    },
  };

  const featureVariants = {
    initial: { opacity: 0, x: -5 },
    animate: (index: number) => ({
      opacity: 1,
      x: 0,
      transition: {
        delay: 0.01 * index, // Reduced delay
        duration: 0.2, // Faster animation
      },
    }),
  };

  return (
    <div className="space-y-8">
      {/* Information banner for users with paid plans - smooth animation */}
      <AnimatePresence>
        {currentUserPlan && currentUserPlan !== UserType.Free && (
          <motion.div
            initial={{ opacity: 0, height: 0, y: -10 }}
            animate={{ opacity: 1, height: "auto", y: 0 }}
            exit={{ opacity: 0, height: 0, y: -10 }}
            transition={{
              duration: PLAN_THEME.animation.duration,
              ease: PLAN_THEME.animation.ease,
              height: { duration: PLAN_THEME.animation.heightDuration }
            }}
            className="overflow-hidden mb-6"
          >
            <div className="bg-blue-900/30 border border-blue-500/30 rounded-lg p-4">
              <div className="flex items-start space-x-3">
                <Info className="h-5 w-5 text-blue-400 mt-0.5 flex-shrink-0" />
                <div>
                  <h4 className="text-blue-200 font-medium mb-1">Upgrade Only Policy</h4>
                  <p className="text-blue-300/80 text-sm">
                    You can only upgrade to higher plans. Downgrades aren&apos;t available through purchase since you&apos;ve already paid for your current tier.
                    Contact support for plan changes or cancellations.
                  </p>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <motion.div
        initial={{ opacity: 0, y: 5 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
        className="flex justify-center items-center space-x-4 mb-8"
      >
        <Label
          htmlFor="billing-toggle"
          className={cn(
            "transition-colors duration-200",
            billingCycle === "monthly" ? "text-white" : "text-white/60"
          )}
        >
          Monthly
        </Label>
        <div className="relative">
          <Switch
            id="billing-toggle"
            checked={billingCycle === "yearly"}
            onCheckedChange={handleBillingToggle}
            className={`data-[state=checked]:${getGradientClass('primaryDark')}`}
          />
          {billingCycle === "yearly" && (
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              className="absolute -top-1 -right-1"
            >
              <span className="flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-pink-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-pink-500"></span>
              </span>
            </motion.div>
          )}
        </div>
        <div className="flex items-center justify-center">
          <Label
            htmlFor="billing-toggle"
            className={cn(
              "transition-colors duration-200",
              billingCycle === "yearly" ? "text-white" : "text-white/60"
            )}
          >
            Yearly
          </Label>
          {/* Reserve space for the badge to prevent layout shift */}
          <div className="ml-2 relative w-20 h-6">
            <AnimatePresence>
              {billingCycle === "yearly" && (
                <motion.span
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  transition={{ duration: 0.2 }}
                  className={`absolute text-xs font-medium ${getGradientClass('save')} px-2 py-0.5 rounded-full whitespace-nowrap`}
                >
                  Save 16%
                </motion.span>
              )}
            </AnimatePresence>
          </div>
        </div>
      </motion.div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
        <AnimatePresence>
          {plans.map((plan, index) => (
            <motion.div
              key={plan.id}
              custom={index}
              initial="initial"
              animate="animate"
              variants={cardVariants}
              whileHover="hover"
              whileTap="tap"
              onHoverStart={() => setHoveredPlan(plan.id)}
              onHoverEnd={() => setHoveredPlan(null)}
              className="h-full"
            >
              <Card
                className={cn(
                  "h-full transition-all duration-300 backdrop-blur-sm bg-black/40 border-white/10 overflow-hidden",
                  selectedPlan?.id === plan.id
                    ? "ring-2 ring-primary cursor-pointer"
                    : hoveredPlan === plan.id
                      ? "border-white/20 cursor-pointer"
                      : plan.userType === currentUserPlan
                        ? "ring-2 ring-green-500 border-green-500/30 cursor-default"
                        : currentUserPlan && isDowngrade(currentUserPlan, plan.userType)
                          ? "border-red-500/30 bg-red-900/20 cursor-not-allowed opacity-60"
                        : plan.userType === UserType.Free
                          ? "opacity-60 cursor-not-allowed"
                          : currentUserPlan && isUpgrade(currentUserPlan, plan.userType)
                            ? "border-blue-500/30 cursor-pointer"
                            : "border-white/10 cursor-pointer",
                  plan.popularPlan ? "relative" : ""
                )}
                onClick={() => {
                  const isCurrentPlan = plan.userType === currentUserPlan;
                  const isFreePlan = plan.userType === UserType.Free;
                  const isDisabledDowngrade = currentUserPlan && isDowngrade(currentUserPlan, plan.userType);
                  if (!isCurrentPlan && !isFreePlan && !isDisabledDowngrade) {
                    onSelectPlan(plan);
                  }
                }}
              >
                {/* Gradient border effect */}
                <div
                  className={cn(
                    "absolute inset-0 opacity-0 transition-opacity duration-300",
                    selectedPlan?.id === plan.id || hoveredPlan === plan.id
                      ? "opacity-100"
                      : ""
                  )}
                  style={{
                    background: `linear-gradient(to bottom right, ${plan.color || "#8b5cf6"}22, transparent)`,
                  }}
                />

                {plan.popularPlan && plan.userType !== currentUserPlan && (
                  <div className="absolute -top-px left-0 right-0">
                    <div className={`h-1 ${getGradientClass('popular')}`} />
                    <div className="flex justify-center">
                      <motion.div
                        initial={{ y: -20, opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        transition={{ delay: 0.2, duration: 0.3 }}
                        className={`${getGradientClass('primary')} text-white text-xs font-medium px-3 py-1 rounded-b-md shadow-lg flex items-center gap-1`}
                      >
                        <Sparkles className="h-3 w-3" />
                        Most Popular
                      </motion.div>
                    </div>
                  </div>
                )}

                {plan.userType === currentUserPlan && (
                  <div className="absolute -top-px left-0 right-0">
                    <div className="h-1 bg-gradient-to-r from-green-500 to-emerald-500" />
                    <div className="flex justify-center">
                      <motion.div
                        initial={{ y: -20, opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        transition={{ delay: 0.2, duration: 0.3 }}
                        className="bg-gradient-to-r from-green-500 to-emerald-500 text-white text-xs font-medium px-3 py-1 rounded-b-md shadow-lg flex items-center gap-1"
                      >
                        <Check className="h-3 w-3" />
                        Current Plan
                      </motion.div>
                    </div>
                  </div>
                )}

                <CardContent
                  className={cn("p-6", plan.popularPlan ? "pt-8" : "")}
                >
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.5 }}
                  >
                    <h3 className="text-xl font-bold mb-1">{plan.name}</h3>
                    <p className="text-white/70 text-sm mb-4">
                      {plan.description}
                    </p>

                    <div className="mb-6">
                      <div className="flex items-baseline">
                        <span className="text-3xl font-bold text-accent">
                          {selectedSymbol}{plan.price.toFixed(2)}
                        </span>
                        <span className="text-white/70 ml-1">
                          /{billingCycle === "monthly" ? "month" : "year"}
                        </span>
                      </div>
                      {plan.savings && (
                        <motion.div
                          initial={{ opacity: 0, y: 5 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: 0.2, duration: 0.3 }}
                          className="text-sm text-green-400 mt-1 flex items-center"
                        >
                          <Sparkles className="h-3 w-3 mr-1" />
                          Save {selectedSymbol}{plan.savings.toFixed(2)} per year
                        </motion.div>
                      )}
                      {plan.userType === currentUserPlan && currentPlanData && (
                        <motion.div
                          initial={{ opacity: 0, y: 5 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: 0.3, duration: 0.3 }}
                          className="text-sm text-zinc-300 mt-2 flex items-center"
                        >
                          <span>
                            {currentPlanData.endDate
                              ? `Expires: ${formatEndDate(currentPlanData.endDate)}`
                              : "Lifetime access"
                            }
                          </span>
                        </motion.div>
                      )}
                    </div>

                    <ul className="space-y-3">
                      {plan.features.map((feature, featureIndex) => (
                        <li key={feature.id}>
                          <motion.div
                            custom={featureIndex}
                            variants={featureVariants}
                            initial="initial"
                            animate="animate"
                            className="flex items-start"
                          >
                            <div
                              className={cn(
                                "mr-2 mt-0.5 flex h-5 w-5 items-center justify-center rounded-full",
                                feature.included
                                  ? feature.highlight
                                    ? getGradientClass('primaryDark') + " text-white shadow-md"
                                    : "bg-zinc-600/60 text-zinc-200 border border-zinc-500/30"
                                  : "bg-zinc-800/40 text-zinc-500 border border-zinc-700/20"
                              )}
                            >
                              {feature.included ? (
                                <Check className="h-3.5 w-3.5" />
                              ) : (
                                <span className="text-xs">-</span>
                              )}
                            </div>
                            <span
                              className={cn(
                                feature.included
                                  ? feature.highlight
                                    ? "text-zinc-100 font-medium"
                                    : "text-zinc-200"
                                  : "text-zinc-500"
                              )}
                            >
                              {feature.name}
                            </span>
                          </motion.div>
                        </li>
                      ))}
                    </ul>

                    {/* Service Limits Section */}
                    <div className="mt-6 pt-4 border-t border-white/10">
                      <h4 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
                        <AlignEndHorizontal className="w-4 h-4" />
                        Service Limits
                      </h4>
                      <div className="space-y-2">
                        {serviceRows.map((service) => {
                          const limits = serviceLimits[plan.userType]?.[service.key as keyof typeof serviceLimits[UserType.Free]];
                          return (
                            <div key={service.key} className="flex justify-between items-center text-xs">
                              <span className="text-gray-400">{service.name}</span>
                              <span className="text-gray-300 font-medium">
                                {service.formatter(limits)}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </motion.div>
                </CardContent>

                <CardFooter className="p-6 pt-0">
                  {(() => {
                    const isCurrentPlan = plan.userType === currentUserPlan;
                    const isDowngradeAttempt = currentUserPlan && isDowngrade(currentUserPlan, plan.userType);
                    const isUpgradeAttempt = currentUserPlan && isUpgrade(currentUserPlan, plan.userType);
                    const isFreePlan = plan.userType === UserType.Free;

                    if (isCurrentPlan) {
                      return (
                        <Button
                          className="w-full bg-gradient-to-r from-green-600 to-emerald-600 text-white border-0 cursor-not-allowed"
                          disabled
                        >
                          Already Active
                        </Button>
                      );
                    }
                    if (isDowngradeAttempt) {
                      return (
                        <Button
                          className="w-full bg-gray-600 text-gray-400 border-gray-600 cursor-not-allowed"
                          disabled
                        >
                          Cannot Downgrade
                        </Button>
                      );
                    }
                    if (isFreePlan) {
                        return (
                          <Button
                            className="w-full bg-gradient-to-r from-green-600 to-emerald-600 text-white border-0 cursor-not-allowed"
                            disabled
                          >
                            Current Plan
                          </Button>
                        );
                    }
                    if (isUpgradeAttempt) {
                      return (
                        <Button
                          className={cn("w-full transition-all duration-300", `${getGradientClass('primaryDark')} hover:${getGradientClass('primaryHover')} text-white border-0`)}
                          onClick={() => {
                            // Immediately go to next step (simulate selection + continue)
                            onSelectPlan(plan);
                          }}
                        >
                          Upgrade Plan
                        </Button>
                      );
                    }
                    // For current plan, show cancel button if not free
                    return null;
                  })()}
                </CardFooter>
              </Card>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* Perks Table */}
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.4 }}
        className="mt-16"
      >
        <Card className="overflow-hidden backdrop-blur-sm bg-black/40 border border-white/10">
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-white/10 bg-white/5">
                    <th className="text-left p-4 font-semibold text-white flex items-center gap-2">
                      <Gift className="w-5 h-5" />
                      Exclusive Creator Perks & Add-Ons
                    </th>
                    {plans.map((plan) => (
                      <th key={plan.id} className="text-center p-4 font-semibold text-white">
                        <div className="flex items-center justify-center gap-2">
                          <div className={`w-3 h-3 rounded-full`} style={{ background: plan.color || "#8b5cf6" }} />
                          {plan.name}
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {perkRows.map((perk) => (
                    <tr key={perk.key} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                      <td className="p-4">
                        <div>
                          <span className="font-medium text-white">{perk.name}</span>
                          {perk.note && (
                            <span className="text-gray-400 ml-1 italic">
                              {perk.note}
                            </span>
                          )}
                        </div>
                      </td>
                      {plans.map((plan) => (
                        <td key={`${perk.key}-${plan.id}`} className="p-4 text-center">
                          {creatorPerks[plan.userType]?.[perk.key as keyof typeof creatorPerks[UserType.Free]] ? (
                            <div className="flex items-center justify-center">
                              <Check className="w-5 h-5 text-green-500" />
                              <span className="ml-1 text-green-400 text-sm">Yes</span>
                            </div>
                          ) : (
                            <span className="text-gray-500">—</span>
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
