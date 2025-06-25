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
import { useCurrency } from "@/lib/CurrencyContext";
import { cn } from "@/lib/utils";
import { UserType } from "@/types/userTypes";
import { getPlanDisplayName } from "@/lib/planUtils";
import { toast } from "sonner";
import { usePlansFromDB, DBPlan } from "@/lib/hooks/usePlansFromDB";
import { PLAN_THEME, getGradientClass } from "@/lib/themeConfig";

type PlanFeature = {
  id: string
  name: string
  included: boolean
  highlight?: boolean
}

export type Plan = {
  id: string;
  name: string;
  description: string;
  price: number;
  features: PlanFeature[];
  popularPlan?: boolean;
  savings?: number;
  color?: string;
  gradient?: string;
  userType: UserType;
  billingPeriod: "monthly" | "yearly";
};

function getTaxRate(currency: string): number {
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
  const { plans: dbPlans, isLoading: plansLoading, isError } = usePlansFromDB();
  
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

  const convertedPlans: Plan[] = useMemo(() => {
    if (plansLoading || !dbPlans) return [];

    return dbPlans.map((dbPlan: DBPlan): Plan => {
      const pricing = (dbPlan.allPricing && dbPlan.allPricing[selectedCurrency]) 
        ? dbPlan.allPricing[selectedCurrency] 
        : dbPlan.pricing;
        
      const monthlyPrice = pricing.monthly.amount;
      const yearlyPrice = pricing.yearly.amount;

      const basePrice = billingCycle === "monthly" ? monthlyPrice : yearlyPrice;
      
      const planId = billingCycle === "monthly" 
      // The features should ideally come from the DB plan
      const features : PlanFeature[] = [
        { id: "feature-1", name: "Core functionality", included: true },
        { id: "feature-2", name: "Priority support", included: true, highlight: dbPlan.type === "plus" || dbPlan.type === "pro" },
        { id: "feature-3", name: "Advanced features", included: dbPlan.type === "pro" || dbPlan.type === "premium" },
      ];

      return {
        id: dbPlan.type,
        name: dbPlan.name,
        description: dbPlan.description,
        price: basePrice,
        billingPeriod: billingCycle,
        features: features, 
        popularPlan: dbPlan.type === "plus",
        color: PLAN_THEME.planColors[dbPlan.type as keyof typeof PLAN_THEME.planColors],
        gradient: `from-${PLAN_THEME.planColors[dbPlan.type as keyof typeof PLAN_THEME.planColors]}-500 to-${PLAN_THEME.planColors[dbPlan.type as keyof typeof PLAN_THEME.planColors]}-600`,
        userType: dbPlan.type as UserType,
        savings: billingCycle === "yearly" ? monthlyPrice * 12 - yearlyPrice : undefined,
      };
    });
  }, [dbPlans, plansLoading, billingCycle, selectedCurrency]);

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
                  billingCycle={billingCycle}
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