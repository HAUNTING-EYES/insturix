"use client"

import { useState, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { ArrowRight, ArrowLeft, Sparkles } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { StepIndicator } from "@/components/upgrade-plan/StepIndicator"
import { PlanSelection } from "@/components/upgrade-plan/PaymentSelection"
import { PlanSummary } from "@/components/upgrade-plan/PlanSummary"
import { PaymentForm } from "@/components/upgrade-plan/PaymentForm"
import { cn } from "@/lib/utils"
import { useMutation } from "@tanstack/react-query"
import axios from "axios"
import { UserType } from "@/types/userTypes"

export type PlanFeature = {
  id: string
  name: string
  included: boolean
  highlight?: boolean
}

export type Plan = {
  id: string
  name: string
  description: string
  price: number
  billingPeriod: "monthly" | "yearly"
  features: PlanFeature[]
  popularPlan?: boolean
  savings?: number
  color?: string
  gradient?: string
  userType: UserType // Associate each plan with a UserType
}

// Sample plans data - in a real app, this might come from an API
const defaultPlans: Plan[] = [
  {
    id: "basic",
    name: "Basic",
    description: "Essential features for individuals",
    price: 0,
    billingPeriod: "monthly",
    color: "#6366f1",
    gradient: "from-indigo-500 to-purple-500",
    userType: UserType.Free,
    features: [
      { id: "feature-1", name: "Core functionality", included: true },
      { id: "feature-2", name: "Basic support", included: true },
      { id: "feature-3", name: "1 project", included: true },
      { id: "feature-4", name: "Limited storage", included: true },
      { id: "feature-5", name: "Advanced analytics", included: false },
      { id: "feature-6", name: "Team collaboration", included: false },
    ],
  },
  {
    id: "plus",
    name: "Plus",
    description: "Advanced features for professionals",
    price: 19.99,
    billingPeriod: "monthly",
    popularPlan: true,
    color: "#8b5cf6",
    gradient: "from-violet-500 to-fuchsia-500",
    userType: UserType.Plus,
    features: [
      { id: "feature-1", name: "Core functionality", included: true },
      { id: "feature-2", name: "Priority support", included: true, highlight: true },
      { id: "feature-3", name: "10 projects", included: true, highlight: true },
      { id: "feature-4", name: "Unlimited storage", included: true, highlight: true },
      { id: "feature-5", name: "Advanced analytics", included: true },
      { id: "feature-6", name: "Team collaboration", included: false },
    ],
  },
  {
    id: "pro",
    name: "Pro",
    description: "Complete solution for teams",
    price: 49.99,
    billingPeriod: "monthly",
    color: "#ec4899",
    gradient: "from-pink-500 to-rose-500",
    userType: UserType.Pro,
    features: [
      { id: "feature-1", name: "Core functionality", included: true },
      { id: "feature-2", name: "24/7 dedicated support", included: true, highlight: true },
      { id: "feature-3", name: "Unlimited projects", included: true, highlight: true },
      { id: "feature-4", name: "Unlimited storage", included: true },
      { id: "feature-5", name: "Advanced analytics", included: true },
      { id: "feature-6", name: "Team collaboration", included: true, highlight: true },
    ],
  },
]

// Yearly plans with discount
const yearlyPlans: Plan[] = defaultPlans.map((plan) => ({
  ...plan,
  id: `${plan.id}-yearly`,
  billingPeriod: "yearly",
  price: plan.price * 10, // 2 months free
  savings: plan.price * 2,
}))

export type UpgradePlanProps = {
  plans?: Plan[]
  onComplete?: (selectedPlan: Plan) => void
  onCancel?: () => void
  taxRate?: number
}

export function UpgradePlan({
  plans = [...defaultPlans, ...yearlyPlans],
  onComplete,
  onCancel,
  taxRate = 0.08,
}: UpgradePlanProps) {
  const [currentStep, setCurrentStep] = useState(1)
  const [selectedPlan, setSelectedPlan] = useState<Plan | null>(null)
  const [billingCycle, setBillingCycle] = useState<"monthly" | "yearly">("monthly")
  const [animationDirection, setAnimationDirection] = useState<"forward" | "backward">("forward")

  // Filter plans based on billing cycle
  const filteredPlans = plans.filter((plan) => plan.billingPeriod === billingCycle)

  const handlePlanSelect = (plan: Plan) => {
    setSelectedPlan(plan)
  }

  const handleNextStep = () => {
    if (currentStep < 3) {
      setAnimationDirection("forward")
      setCurrentStep(currentStep + 1)
    } else if (currentStep === 3) {
      // Use the dedicated payment handling function
      handlePaymentComplete()
    }
  }

  const handlePreviousStep = () => {
    if (currentStep > 1) {
      setAnimationDirection("backward")
      setCurrentStep(currentStep - 1)
    }
  }

  const handleBillingCycleChange = (cycle: "monthly" | "yearly") => {
    setBillingCycle(cycle)

    // Update selected plan to match the new billing cycle
    if (selectedPlan) {
      const matchingPlan = plans.find((plan) => plan.name === selectedPlan.name && plan.billingPeriod === cycle)
      if (matchingPlan) {
        setSelectedPlan(matchingPlan)
      }
    }
  }

  // Calculate tax amount
  const calculateTax = (price: number) => {
    return price * taxRate
  }

  // Calculate total amount
  const calculateTotal = (price: number) => {
    return price + calculateTax(price)
  }

  // React Query mutation for plan upgrade
  const upgradePlanMutation = useMutation({
    mutationFn: async (plan: Plan) => {
      const response = await axios.patch("/api/user/plans/upgrade", {
        userType: plan.userType,
        planDetails: {
          name: plan.name,
          price: plan.price,
          billingPeriod: plan.billingPeriod,
          features: plan.features.filter(f => f.included).map(f => f.name),
          startDate: new Date().toISOString(),
        }
      });
      
      return response.data;
    },
    onSuccess: () => {
      if (onComplete && selectedPlan) {
        onComplete(selectedPlan);
      }
    }
  });

  // New function specific for handling payment completion
  const handlePaymentComplete = () => {
    if (!selectedPlan) return;
    
    upgradePlanMutation.mutate(selectedPlan);
  };

  // Background gradient animation
  useEffect(() => {
    const interval = setInterval(() => {
      const gradientElement = document.getElementById("animated-gradient")
      if (gradientElement) {
        gradientElement.style.backgroundPosition = `${Math.random() * 100}% ${Math.random() * 100}%`
      }
    }, 3000)

    return () => clearInterval(interval)
  }, [])

  return (
    <div className="relative w-full max-w-4xl mx-auto">
      {/* Animated background gradient */}
      <div
        id="animated-gradient"
        className="absolute inset-0 bg-gradient-to-br from-violet-900/20 via-fuchsia-900/20 to-indigo-900/20 rounded-xl blur-3xl -z-10 transition-all duration-[3000ms] ease-in-out"
        style={{ backgroundSize: "200% 200%" }}
      />

      <Card className="w-full backdrop-blur-sm bg-black/40 border border-white/10 shadow-xl rounded-xl overflow-hidden">
        <CardContent className="p-0">
          <div className="p-6 md:p-8">
            <div className="flex flex-col items-center text-center mb-8">
              <motion.div
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1, duration: 0.5 }}
                className="mb-2"
              >
                <Sparkles className="h-8 w-8 text-primary mb-2" />
              </motion.div>
              <motion.h2
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2, duration: 0.5 }}
                className="text-2xl md:text-3xl font-bold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-violet-400 to-pink-400"
              >
                Upgrade Your Experience
              </motion.h2>
              <motion.p
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3, duration: 0.5 }}
                className="text-muted-foreground mt-2 max-w-md"
              >
                Choose the plan that works best for you and unlock premium features
              </motion.p>
            </div>

            <StepIndicator currentStep={currentStep} totalSteps={3} />

            <AnimatePresence mode="wait" custom={animationDirection}>
              <motion.div
                key={currentStep}
                custom={animationDirection}
                initial="initial"
                animate="animate"
                exit="exit"
                className="mt-8"
              >
                {currentStep === 1 && (
                  <PlanSelection
                    plans={filteredPlans}
                    selectedPlan={selectedPlan}
                    onSelectPlan={handlePlanSelect}
                    billingCycle={billingCycle}
                    onBillingCycleChange={handleBillingCycleChange}
                  />
                )}

                {currentStep === 2 && selectedPlan && (
                  <PlanSummary
                    plan={selectedPlan}
                    taxRate={taxRate}
                    taxAmount={calculateTax(selectedPlan.price)}
                    totalAmount={calculateTotal(selectedPlan.price)}
                  />
                )}

                {currentStep === 3 && selectedPlan && (
                  <PaymentForm plan={selectedPlan} totalAmount={calculateTotal(selectedPlan.price)} />
                )}
              </motion.div>
            </AnimatePresence>

            <div className="flex justify-between mt-8 pt-6 border-t border-white/10">
              <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                {currentStep > 1 ? (
                  <Button
                    variant="outline"
                    onClick={handlePreviousStep}
                    className="flex items-center gap-2 bg-transparent border-white/20 hover:bg-white/10 transition-all duration-300"
                  >
                    <ArrowLeft className="h-4 w-4" />
                    Back
                  </Button>
                ) : (
                  <Button
                    variant="outline"
                    onClick={onCancel}
                    className="bg-transparent border-white/20 hover:bg-white/10 transition-all duration-300"
                  >
                    Cancel
                  </Button>
                )}
              </motion.div>

              <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                <Button
                  onClick={handleNextStep}
                  disabled={(currentStep === 1 && !selectedPlan) || upgradePlanMutation.isPending}
                  className={cn(
                    "flex items-center gap-2 transition-all duration-300",
                    currentStep === 3
                      ? "bg-gradient-to-r from-violet-600 to-pink-600 hover:from-violet-500 hover:to-pink-500"
                      : "bg-primary hover:bg-primary/90",
                  )}
                >
                  {currentStep === 3 
                    ? (upgradePlanMutation.isPending ? "Processing..." : "Complete Payment") 
                    : "Continue"}
                  {currentStep < 3 && <ArrowRight className="h-4 w-4" />}
                </Button>
              </motion.div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
