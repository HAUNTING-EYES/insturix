"use client";

import React, { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowRight, CheckCircle, Crown } from "lucide-react";
import { useRouter } from "next/navigation";
// import { useUser } from "@clerk/nextjs"; // Removed useUser
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { StepIndicator } from "@/components/upgrade-plan/StepIndicator";
import { PlanSelection } from "@/components/upgrade-plan/PaymentSelection";
import { PaymentForm } from "@/components/upgrade-plan/PaymentForm";
import { useCurrency } from "@/lib/CurrencyContext";
import { cn } from "@/lib/utils";
import { UserType } from "@/types/userTypes";
import { useToast } from "@/hooks/use-toast";
import { PLAN_THEME, getGradientClass } from "@/lib/themeConfig";
import { CurrencySelector } from "../CurrencySelector";
// import { usePlansFromDB } from "@/lib/hooks/usePlansFromDB"; // Removed usePlansFromDB

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
  paymentProvider?: { provider: string; planId: string; };
};


import { Plan as ClientPlan } from "@/lib/data/plans";

import { PlansResponse } from "@/schemas/plans"; // Import PlansResponse

export interface UpgradePageContentProps {
  mode?: "popup" | "page";
  onComplete?: (selectedPlan: Plan) => void;
  onCancel?: () => void;
  initialPlan?: string;
  showNavigation?: boolean;
  isDevelopment: boolean;
  currentUserPlan: UserType | null; // Add currentUserPlan prop
  currentPlanData: { endDate: Date | null; startDate: Date; status: string; } | null; // Add currentPlanData prop
  plans: PlansResponse["plans"]; // Add plans prop
  success: PlansResponse["success"]; // Add success prop
}

export function UpgradePageContent({
  mode = "page",
  onComplete,
  onCancel,
  initialPlan,
  showNavigation = true,
  isDevelopment,
  currentUserPlan: initialUserPlan, // Destructure new props
  currentPlanData: initialPlanData, // Destructure new props
  plans: serverPlans, // Rename plans to serverPlans to match existing logic
  success: plansSuccess, // Rename success to plansSuccess
}: UpgradePageContentProps) {
  const router = useRouter();
  // const { user } = useUser(); // Removed useUser
  const { selectedCurrency } = useCurrency();
  // const { plans: serverPlans, isLoading: plansLoading, isError: plansError } = usePlansFromDB(); // Removed usePlansFromDB
  const { toast } = useToast();
  
  const [currentStep, setCurrentStep] = useState(1);
  const [selectedPlan, setSelectedPlan] = useState<Plan | null>(null);
  const [animationDirection, setAnimationDirection] = useState<"forward" | "backward">("forward");
  const [paymentSuccess, setPaymentSuccess] = useState(false);
  const [currentUserPlan] = useState<UserType | null>(initialUserPlan); // Initialize with prop
  const [currentPlanData] = useState<{ // Initialize with prop
    endDate: Date | null;
    startDate: Date;
    status: string;
  } | null>(initialPlanData);
  // Determine authentication from server-provided prop: null means not signed in
  const isAuthenticated = currentUserPlan !== null;
  const [billingCycle, setBillingCycle] = useState<"monthly" | "yearly">("monthly");
  const [dynamicPlans, setDynamicPlans] = useState(serverPlans);
  const [plansLoading, setPlansLoading] = useState(false);

  // Only fetch plans client-side if server plans are not available or if currency changes
 useEffect(() => {
    const fetchPlansForCurrency = async () => {
      if (!serverPlans || serverPlans.length === 0) {
        setPlansLoading(true);
        try {
          const response = await fetch(`/api/plans?currency=${selectedCurrency}`, { cache: "no-store" });
          if (!response.ok) {
            // Handle non-200 responses to prevent processing HTML error pages
            const errorText = await response.text();
            console.error('[UpgradePageContent] fetch error:', response.status, errorText);
            // Optionally set an error state or show a message
            return;
          }
          const data = await response.json();
          setDynamicPlans(data.plans);
        } catch (error) {
          console.error('[UpgradePageContent] fetch error:', error);
          // Optionally set an error state or show a message
        } finally {
          setPlansLoading(false);
        }
      } else {
        // If server plans are available, use them directly and only refetch on currency change
        setDynamicPlans(serverPlans);
      }
    };

    fetchPlansForCurrency();
  }, [serverPlans, selectedCurrency]);


  const convertedPlans: Plan[] = useMemo(() => {
    if (!dynamicPlans) return [];

    const plansArray = dynamicPlans.map((clientPlan: ClientPlan): Plan => {
      const cyclePricing = billingCycle === "monthly" ? clientPlan.pricing.monthly : clientPlan.pricing.yearly;
      const monthlyPrice = clientPlan.pricing.monthly.amount;
      const yearlyPrice = clientPlan.pricing.yearly.amount;

      const basePrice = cyclePricing.amount;
      
      const planId = cyclePricing.paymentProvider?.planId || '';
      const provider = cyclePricing.paymentProvider?.provider || '';
      
      const features : PlanFeature[] = (() => {
        switch (clientPlan.type) {
          case "free":
            return [
              { id: "feature-1", name: "Basic AI tools access", included: true },
              { id: "feature-2", name: "Community support", included: true },
              { id: "feature-3", name: "Monthly usage limits", included: true },
              { id: "feature-4", name: "Standard processing speed", included: true },
            ];
          case "plus":
            return [
              { id: "feature-1", name: "Enhanced AI capabilities", included: true, highlight: true },
              { id: "feature-2", name: "Increased usage quotas", included: true, highlight: true },
              { id: "feature-3", name: "Email support", included: true },
              { id: "feature-4", name: "Standard processing speed", included: true },
              { id: "feature-5", name: "Export & sharing options", included: true },
            ];
          case "pro":
            return [
              { id: "feature-1", name: "Advanced AI features", included: true, highlight: true },
              { id: "feature-2", name: "High usage limits", included: true, highlight: true },
              { id: "feature-3", name: "Priority support", included: true, highlight: true },
              { id: "feature-4", name: "Faster processing", included: true },
              { id: "feature-5", name: "Early access to beta tools", included: true, highlight: true },
              { id: "feature-6", name: "Creator community access", included: true, highlight: true },
            ];
          case "premium":
            return [
              { id: "feature-1", name: "Unlimited AI access", included: true, highlight: true },
              { id: "feature-2", name: "Premium processing speed", included: true, highlight: true },
              { id: "feature-3", name: "24/7 priority support", included: true, highlight: true },
              { id: "feature-4", name: "Dedicated success manager", included: true, highlight: true },
              { id: "feature-5", name: "Exclusive creator events", included: true, highlight: true },
              { id: "feature-6", name: "All beta features included", included: true },
            ];
          default:
            return [
              { id: "feature-1", name: "Core functionality", included: true },
              { id: "feature-2", name: "Priority support", included: true, highlight: clientPlan.type === "plus" || clientPlan.type === "pro" },
              { id: "feature-3", name: "Advanced features", included: clientPlan.type === "pro" || clientPlan.type === "premium" },
            ];
        }
      })();

      const convertedPlan = {
        id: clientPlan.type,
        name: clientPlan.name || '',
        description: clientPlan.description || '',
        price: Number(basePrice) || 0,
        billingPeriod: billingCycle,
        features: features,
        popularPlan: clientPlan.type === "plus",
        color: PLAN_THEME.planColors[clientPlan.type as keyof typeof PLAN_THEME.planColors] || 'gray',
        gradient: `from-${(PLAN_THEME.planColors[clientPlan.type as keyof typeof PLAN_THEME.planColors] || 'gray')}-500 to-${(PLAN_THEME.planColors[clientPlan.type as keyof typeof PLAN_THEME.planColors] || 'gray')}-600`,
        userType: clientPlan.type as UserType,
        savings: billingCycle === "yearly" ? (monthlyPrice * 12) - yearlyPrice : undefined,
        paymentProvider: provider ? { provider, planId } : undefined,
      };

      try {
        const singleStr = JSON.stringify(convertedPlan);
        console.log('[DEBUG] Converted single plan', clientPlan.type, 'serializes OK');
      } catch (err) {
        console.error('[DEBUG] Cannot serialize converted plan', clientPlan.type, ':', err);
      }

      return convertedPlan;
    });

    try {
      const allStr = JSON.stringify(plansArray);
      console.log('[DEBUG] Full convertedPlans array serializes OK');
    } catch (err) {
      console.error('[DEBUG] Cannot serialize full convertedPlans:', err);
    }

    console.log('[DEBUG] Completed convertedPlans computation');

    return plansArray;
  }, [dynamicPlans, billingCycle]);

  // Removed useEffect for fetching user plan
  // useEffect(() => {
  //   const fetchUserPlan = async () => {
  //     if (!user) {
  //       setCurrentUserPlan(null); // Set to null if no user is logged in
  //       setIsLoading(false);
  //       return;
  //     }

  //     try {
  //       const response = await fetch('/api/user/plans');
  //       if (response.ok) {
  //         const data = await response.json();
  //         setCurrentUserPlan(data.userType || UserType.Free);
          
  //         if (data.currentPlan) {
  //           setCurrentPlanData({
  //             endDate: data.currentPlan.endDate ? new Date(data.currentPlan.endDate) : null,
  //             startDate: new Date(data.currentPlan.startDate),
  //             status: data.currentPlan.status
  //           });
  //         }
  //       }
  //     } catch (error) {
  //       console.error('Error fetching user plan:', error);
  //     } finally {
  //       setIsLoading(false);
  //     }
  //   };

  //   fetchUserPlan();
  // }, [user, selectedCurrency]); // Added selectedCurrency to re-fetch user plan if currency changes

  // Keep this useEffect for initialPlan and convertedPlans
  // This useEffect should still run on the client to set the initial selected plan based on searchParams
  useEffect(() => {
    if (initialPlan && convertedPlans.length > 0) {
      const plan = convertedPlans.find(p => p.id === initialPlan || p.name.toLowerCase() === initialPlan.toLowerCase());
      if (plan) {
        setSelectedPlan(plan);
      }
    }
  }, [initialPlan, convertedPlans]);

  useEffect(() => {
    // Debug: log incoming SSR props for current user plan
    console.log('[UpgradePageContent] debug props:', { initialUserPlan, initialPlanData });
  }, [initialUserPlan, initialPlanData]);

  // Keep this useEffect for selectedPlan
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
    if (currentStep < 2) { // Only 2 steps now: Plan Selection and Payment
      if (!selectedPlan) return;

      // If plan costs > 0, require authentication
      if (selectedPlan.price > 0 && !isAuthenticated) {
        toast({
          title: 'Sign in required',
          description: 'Please sign in to continue to payment.',
        });
        // Redirect to sign in page
        router.push('/signin');
        return;
      }

      // Free plans complete immediately
      if (selectedPlan.price === 0 && currentStep === 1) {
        handlePaymentSuccess();
        return;
      }

      setAnimationDirection("forward");
      setCurrentStep(currentStep + 1);
    }
  };


  const calculateTotal = (price: number) => {
    return price; // No taxes
  };

  const handlePaymentSuccess = () => {
    setPaymentSuccess(true);
    toast({
      title: "Success",
      description: "Payment successful! Your plan has been upgraded.",
    });
    
    setTimeout(() => {
      if (onComplete && selectedPlan) {
        onComplete(selectedPlan);
      } else {
        router.push('/dashboard');
      }
    }, 2000);
  };

  const handlePaymentError = (error: string) => {
    toast({
      title: "Error",
      description: `Payment failed: ${error}`,
      variant: "destructive",
    });
  };

  const handleCancel = () => {
    if (onCancel) {
      onCancel();
    } else {
      router.back();
    }
  };

  if (plansLoading || !plansSuccess) {
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
        <div className="text-center mb-12">
          <div className="flex items-center justify-center mb-4">
            <div className="mr-3">
              <Crown className="h-8 w-8 text-amber-500" />
            </div>
            <h1 className="text-4xl md:text-6xl font-bold text-white">
              Upgrade Your Experience
            </h1>
          </div>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto mb-8">
            Choose the perfect plan to unlock premium features and take your productivity to the next level
          </p>

          {isDevelopment && (
            
          <div className="flex justify-center mb-6">
            <CurrencySelector />
          </div>
          )}

         </div>
      )}

      {currentStep < 3 && (
        <div className="mb-8">
          <StepIndicator currentStep={currentStep} totalSteps={2} />
        </div>
      )}

      <Card className="backdrop-blur-sm bg-black/40 border border-white/10 shadow-xl rounded-xl overflow-hidden">
        <CardContent className="p-8">
          <div>
            {currentStep === 1 && (
              (() => {
                try {
                  console.log('[DEBUG] Attempting to render PlanSelection');
                  return (
                    <PlanSelection
                      plans={convertedPlans.map(p => ({ ...p }))}
                      selectedPlan={selectedPlan}
                      onSelectPlan={handlePlanSelect}
                      billingCycle={billingCycle}
                      onBillingCycleChange={handleBillingCycleChange}
                      currentUserPlan={currentUserPlan}
                      currentPlanData={currentPlanData}
                    />
                  );
                } catch (err) {
                  console.error('[DEBUG] Error rendering PlanSelection:', err);
                  return <div>Error rendering plan selection</div>;
                }
              })()
            )}

            {currentStep === 2 && selectedPlan && (
              <PaymentForm
                plan={selectedPlan}
                billingCycle={billingCycle}
                totalAmount={calculateTotal(selectedPlan.price)}
                onPaymentSuccess={handlePaymentSuccess}
                onPaymentError={handlePaymentError}
              />
            )}
          </div>

          {showNavigation && currentStep < 2 && ( // Navigation only for step 1
            <>
              <div className="flex justify-between mt-8 pt-6 border-t border-white/10">
                <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                  <Button
                    variant="outline"
                    onClick={handleCancel}
                    className="bg-transparent border-white/20 hover:bg-white/10"
                  >
                    Cancel
                  </Button>
                </motion.div>

                <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                  <Button
                    onClick={handleNextStep}
                    disabled={!selectedPlan || (!!selectedPlan && selectedPlan.price > 0 && !isAuthenticated)}
                    className={cn(
                      "flex items-center gap-2 transition-all duration-300 shadow-lg",
                      selectedPlan?.color
                        ? `${getGradientClass('primaryDark')} hover:${getGradientClass('primaryHover')} text-white`
                        : `${getGradientClass('primaryDark')} hover:${getGradientClass('primaryHover')} text-white`
                    )}
                  >
                    Continue to Payment
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </motion.div>
              </div>
              {selectedPlan && selectedPlan.price > 0 && !isAuthenticated && (
                <p className="text-sm text-muted-foreground mt-2">You must be signed in to purchase paid plans. Click continue to sign in.</p>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}