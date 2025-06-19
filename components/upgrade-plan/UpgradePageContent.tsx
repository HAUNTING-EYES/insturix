"use client";

import React, { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowRight, ArrowLeft, CheckCircle, Crown } from "lucide-react";
import { useRouter } from "next/navigation";
import { useUser } from "@clerk/nextjs";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { StepIndicator } from "@/components/upgrade-plan/StepIndicator";
import { PlanSelection } from "@/components/upgrade-plan/PaymentSelection";
import { PlanSummary } from "@/components/upgrade-plan/PlanSummary";
import { PaymentForm } from "@/components/upgrade-plan/PaymentForm";
import { CurrencySelector } from "@/components/CurrencySelector";
import { useCurrency } from "@/lib/CurrencyContext";
import { cn } from "@/lib/utils";
import { UserType } from "@/types/userTypes";
import { getPlanDisplayName } from "@/lib/planUtils";
import { toast } from "sonner";
import type { Plan } from "@/components/upgrade-plan/upgrade-plan";
import { PLAN_THEME, getGradientClass } from "@/lib/themeConfig";

const basePlansUSD: Plan[] = [
  {
    id: "free",
    name: getPlanDisplayName(UserType.Free),
    description: "Get started with basic features",
    price: 0,
    billingPeriod: "monthly",
    color: "#10b981",
    gradient: "from-green-500 to-emerald-500",
    userType: UserType.Free,
    features: [
      { id: "feature-1", name: "Basic functionality", included: true },
      { id: "feature-2", name: "Community support", included: true },
      { id: "feature-3", name: "1 project", included: true },
      { id: "feature-4", name: "Basic analytics", included: true },
    ],
  },
  {
    id: "plus",
    name: getPlanDisplayName(UserType.Plus),
    description: "Advanced features for professionals",
    price: 2.99,
    billingPeriod: "monthly",
    popularPlan: true,
    color: PLAN_THEME.planColors.plus,
    gradient: "from-blue-500 to-blue-600",
    userType: UserType.Plus,
    features: [
      { id: "feature-1", name: "Core functionality", included: true },
      { id: "feature-2", name: "Priority support", included: true, highlight: true },
      { id: "feature-3", name: "10 projects", included: true, highlight: true },
      { id: "feature-4", name: "Advanced analytics", included: true },
    ],
  },
  {
    id: "pro",
    name: getPlanDisplayName(UserType.Pro),
    description: "Complete solution for teams",
    price: 5.99,
    billingPeriod: "monthly",
    color: PLAN_THEME.planColors.pro,
    gradient: "from-purple-500 to-purple-600",
    userType: UserType.Pro,
    features: [
      { id: "feature-1", name: "Core functionality", included: true },
      { id: "feature-2", name: "24/7 dedicated support", included: true, highlight: true },
      { id: "feature-3", name: "Unlimited projects", included: true, highlight: true },
      { id: "feature-4", name: "Advanced analytics", included: true },
      { id: "feature-5", name: "Team collaboration", included: true, highlight: true },
    ],
  },
  {
    id: "premium",
    name: getPlanDisplayName(UserType.Premium),
    description: "Ultimate solution for enterprises",
    price: 9.99,
    billingPeriod: "monthly",
    color: "#f59e0b",
    gradient: "from-amber-500 to-orange-500",
    userType: UserType.Premium,
    features: [
      { id: "feature-1", name: "Everything in Pro", included: true },
      { id: "feature-2", name: "Dedicated support", included: true, highlight: true },
      { id: "feature-3", name: "Custom integrations", included: true, highlight: true },
      { id: "feature-4", name: "API access", included: true, highlight: true },
    ],
  },
];

const CURRENCY_RATES: Record<string, number> = {
  USD: 1,
  EUR: 0.85,
  GBP: 0.73,
  INR: 83.12,
  CAD: 1.36,
  AUD: 1.52,
  SGD: 1.34,
  AED: 3.67,
};

const TAX_RATES: Record<string, number> = {
  USD: 0.0875,
  EUR: 0.20,
  GBP: 0.20,
  INR: 0.18,
  CAD: 0.13,
  AUD: 0.10,
  SGD: 0.07,
  AED: 0.05,
};

function convertPrice(usdPrice: number, targetCurrency: string): number {
  const rate = CURRENCY_RATES[targetCurrency] || 1;
  return Math.round((usdPrice * rate) * 100) / 100;
}

function getTaxRate(currency: string): number {
  return TAX_RATES[currency] || 0.18;
}

export interface UpgradePageContentProps {
  mode?: "popup" | "page";
  onComplete?: (selectedPlan: Plan) => void;
  onCancel?: () => void;
  initialPlan?: string;
  showNavigation?: boolean;
}

export function UpgradePageContent({
  mode = "page",
  onComplete,
  onCancel,
  initialPlan,
  showNavigation = true,
}: UpgradePageContentProps) {
  const router = useRouter();
  const { user } = useUser();
  const { selectedCurrency, selectedSymbol, version } = useCurrency();
  
  const [currentStep, setCurrentStep] = useState(1);
  const [selectedPlan, setSelectedPlan] = useState<Plan | null>(null);
  const [animationDirection, setAnimationDirection] = useState<"forward" | "backward">("forward");
  const [paymentSuccess, setPaymentSuccess] = useState(false);
  const [currentUserPlan, setCurrentUserPlan] = useState<UserType>(UserType.Free);
  const [currentPlanData, setCurrentPlanData] = useState<{
    endDate: Date | null;
    startDate: Date;
    status: string;
  } | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [billingCycle, setBillingCycle] = useState<"monthly" | "yearly">("monthly");

  const effectiveTaxRate = getTaxRate(selectedCurrency);

  const convertedPlans = useMemo(() => {
    return basePlansUSD.map(plan => {
      const basePrice = convertPrice(plan.price, selectedCurrency);
      const finalPrice = billingCycle === "yearly" ? basePrice * 12 * 0.84 : basePrice; // 16% discount for yearly
      return {
        ...plan,
        price: finalPrice,
        billingPeriod: billingCycle,
        savings: billingCycle === "yearly" ? basePrice * 12 * 0.16 : undefined
      };
    });
  }, [selectedCurrency, version, billingCycle]);

  useEffect(() => {
    const fetchUserPlan = async () => {
      if (!user) {
        setIsLoading(false);
        return;
      }

      try {
        const response = await fetch('/api/user/plans');
        if (response.ok) {
          const data = await response.json();
          setCurrentUserPlan(data.userType || UserType.Free);
          
          if (data.currentPlan) {
            setCurrentPlanData({
              endDate: data.currentPlan.endDate ? new Date(data.currentPlan.endDate) : null,
              startDate: new Date(data.currentPlan.startDate),
              status: data.currentPlan.status
            });
          }
        }
      } catch (error) {
        console.error('Error fetching user plan:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchUserPlan();
  }, [user]);

  useEffect(() => {
    if (initialPlan && convertedPlans.length > 0) {
      const plan = convertedPlans.find(p => p.id === initialPlan || p.name.toLowerCase() === initialPlan.toLowerCase());
      if (plan) {
        setSelectedPlan(plan);
      }
    }
  }, [initialPlan, convertedPlans]);

  useEffect(() => {
    if (selectedPlan) {
      const updatedPlan = convertedPlans.find(p => p.id === selectedPlan.id);
      if (updatedPlan) {
        setSelectedPlan(updatedPlan);
      }
    }
  }, [convertedPlans, selectedPlan]);

  const handlePlanSelect = (plan: Plan) => {
    setSelectedPlan(plan);
  };

  const handleBillingCycleChange = (cycle: "monthly" | "yearly") => {
    setBillingCycle(cycle);
  };

  const handleNextStep = () => {
    if (currentStep < 3) {
      if (selectedPlan?.price === 0 && currentStep === 1) {
        handlePaymentSuccess();
        return;
      }
      
      setAnimationDirection("forward");
      setCurrentStep(currentStep + 1);
    }
  };

  const handlePreviousStep = () => {
    if (currentStep > 1) {
      setAnimationDirection("backward");
      setCurrentStep(currentStep - 1);
    }
  };

  const calculateTax = (price: number) => {
    return price * effectiveTaxRate;
  };

  const calculateTotal = (price: number) => {
    return price + calculateTax(price);
  };

  const handlePaymentSuccess = () => {
    setPaymentSuccess(true);
    toast.success("Payment successful! Your plan has been upgraded.");
    
    setTimeout(() => {
      if (onComplete && selectedPlan) {
        onComplete(selectedPlan);
      } else {
        router.push('/dashboard');
      }
    }, 2000);
  };

  const handlePaymentError = (error: string) => {
    toast.error(`Payment failed: ${error}`);
  };

  const handleCancel = () => {
    if (onCancel) {
      onCancel();
    } else {
      router.back();
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (paymentSuccess) {
    return (
      <div className={cn(
        "flex items-center justify-center",
        mode === "popup" ? "min-h-[400px]" : "min-h-screen"
      )}>
        <Card className="w-full max-w-md backdrop-blur-sm bg-black/40 border border-white/10 shadow-xl rounded-xl">
          <CardContent className="p-8 text-center">
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: "spring", duration: 0.5 }}
              className="mb-4"
            >
              <CheckCircle className="h-16 w-16 text-green-500 mx-auto" />
            </motion.div>
            <motion.h2
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="text-2xl font-bold text-white mb-2"
            >
              Payment Successful!
            </motion.h2>
            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="text-white/70 mb-4"
            >
              Your {selectedPlan?.name} plan has been activated successfully.
            </motion.p>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.4 }}
            >
              <Button
                onClick={() => {
                  if (onComplete && selectedPlan) {
                    onComplete(selectedPlan);
                  } else {
                    router.push('/dashboard');
                  }
                }}
                className={`${getGradientClass('primaryDark')} hover:${getGradientClass('primaryHover')}`}
              >
                Continue to Dashboard
              </Button>
            </motion.div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="w-full max-w-7xl mx-auto">
      {mode === "page" && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="text-center mb-12"
        >
          <div className="flex items-center justify-center mb-4">
            <motion.div
              initial={{ rotate: 0 }}
              animate={{ rotate: 360 }}
              transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
              className="mr-3"
            >
              <Crown className="h-8 w-8 text-amber-500" />
            </motion.div>
            <h1 className="text-4xl md:text-6xl font-bold text-white">
              Upgrade Your Experience
            </h1>
          </div>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto mb-8">
            Choose the perfect plan to unlock premium features and take your productivity to the next level
          </p>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3, duration: 0.5 }}
            className="flex justify-center mb-8"
          >
            <CurrencySelector compact={false} />
          </motion.div>
        </motion.div>
      )}

      {currentStep < 3 && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4, duration: 0.5 }}
          className="mb-8"
        >
          <StepIndicator currentStep={currentStep} totalSteps={3} />
        </motion.div>
      )}

      <Card className="backdrop-blur-sm bg-black/40 border border-white/10 shadow-xl rounded-xl overflow-hidden">
        <CardContent className="p-8">
          <AnimatePresence mode="wait" custom={animationDirection}>
            <motion.div
              key={currentStep}
              custom={animationDirection}
              initial={{ opacity: 0, x: animationDirection === "forward" ? 50 : -50 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: animationDirection === "forward" ? -50 : 50 }}
              transition={{ duration: 0.3 }}
            >
              {currentStep === 1 && (
                <PlanSelection
                  plans={convertedPlans}
                  selectedPlan={selectedPlan}
                  onSelectPlan={handlePlanSelect}
                  billingCycle={billingCycle}
                  onBillingCycleChange={handleBillingCycleChange}
                  currentUserPlan={currentUserPlan}
                  currentPlanData={currentPlanData}
                />
              )}

              {currentStep === 2 && selectedPlan && (
                <PlanSummary
                  plan={selectedPlan}
                  taxRate={effectiveTaxRate}
                  taxAmount={calculateTax(selectedPlan.price)}
                  totalAmount={calculateTotal(selectedPlan.price)}
                />
              )}

              {currentStep === 3 && selectedPlan && (
                <PaymentForm
                  plan={selectedPlan}
                  totalAmount={calculateTotal(selectedPlan.price)}
                  onPaymentSuccess={handlePaymentSuccess}
                  onPaymentError={handlePaymentError}
                />
              )}
            </motion.div>
          </AnimatePresence>

          {showNavigation && currentStep < 3 && (
            <div className="flex justify-between mt-8 pt-6 border-t border-white/10">
              <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                {currentStep > 1 ? (
                  <Button
                    variant="outline"
                    onClick={handlePreviousStep}
                    className="flex items-center gap-2 bg-transparent border-white/20 hover:bg-white/10"
                  >
                    <ArrowLeft className="h-4 w-4" />
                    Back
                  </Button>
                ) : (
                  <Button
                    variant="outline"
                    onClick={handleCancel}
                    className="bg-transparent border-white/20 hover:bg-white/10"
                  >
                    Cancel
                  </Button>
                )}
              </motion.div>

              <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                <Button
                  onClick={handleNextStep}
                  disabled={currentStep === 1 && !selectedPlan}
                  className={cn(
                    "flex items-center gap-2 transition-all duration-300 shadow-lg",
                    selectedPlan?.color
                      ? `${getGradientClass('primaryDark')} hover:${getGradientClass('primaryHover')} text-white`
                      : `${getGradientClass('primaryDark')} hover:${getGradientClass('primaryHover')} text-white`
                  )}
                >
                  Continue
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </motion.div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}