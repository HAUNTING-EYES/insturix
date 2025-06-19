"use client"

import { useState, useEffect, useMemo } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { ArrowRight, ArrowLeft, Sparkles, CheckCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { StepIndicator } from "@/components/upgrade-plan/StepIndicator"
import { PlanSelection } from "@/components/upgrade-plan/PaymentSelection"
import { PlanSummary } from "@/components/upgrade-plan/PlanSummary"
import { PaymentForm } from "@/components/upgrade-plan/PaymentForm"
import { CurrencySelector } from "@/components/CurrencySelector"
import { useCurrency } from "@/lib/CurrencyContext"
import { cn } from "@/lib/utils"
import { UserType } from "@/types/userTypes"
import { getPlanDisplayName } from "@/lib/planUtils"
import { toast } from "sonner"
import { PLAN_THEME, getGradientClass } from "@/lib/themeConfig"

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
  userType: UserType
}

// Base plan prices in USD for reference
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
    gradient: PLAN_THEME.gradients.primary.replace("bg-gradient-to-r ", ""),
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
    gradient: PLAN_THEME.gradients.primary.replace("bg-gradient-to-r ", ""),
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
]

// Currency conversion rates (approximate, in production use real-time rates)
const CURRENCY_RATES: Record<string, number> = {
  USD: 1,
  EUR: 0.85,
  GBP: 0.73,
  INR: 83.12,
  CAD: 1.36,
  AUD: 1.52,
  SGD: 1.34,
  AED: 3.67,
}

// Country-specific tax rates
const TAX_RATES: Record<string, number> = {
  USD: 0.0875, // Average US sales tax
  EUR: 0.20,   // Average EU VAT
  GBP: 0.20,   // UK VAT
  INR: 0.18,   // India GST
  CAD: 0.13,   // Canada HST/GST
  AUD: 0.10,   // Australia GST
  SGD: 0.07,   // Singapore GST
  AED: 0.05,   // UAE VAT
}

function convertPrice(usdPrice: number, targetCurrency: string): number {
  const rate = CURRENCY_RATES[targetCurrency] || 1
  return Math.round((usdPrice * rate) * 100) / 100
}

function getTaxRate(currency: string): number {
  return TAX_RATES[currency] || 0.18 // Default to 18% if currency not found
}

export type UpgradePlanProps = {
  plans?: Plan[]
  onComplete?: (selectedPlan: Plan) => void
  onCancel?: () => void
  taxRate?: number
  currentUserPlan?: UserType
  currentPlanData?: {
    endDate: Date | null;
    startDate: Date;
    status: string;
  } | null;
}

export function UpgradePlan({
  plans = basePlansUSD,
  onComplete,
  onCancel,
  taxRate,
  currentUserPlan = UserType.Free,
  currentPlanData,
}: UpgradePlanProps) {
  const { selectedCurrency, selectedSymbol, version } = useCurrency()
  const [currentStep, setCurrentStep] = useState(1)
  const [selectedPlan, setSelectedPlan] = useState<Plan | null>(null)
  const [animationDirection, setAnimationDirection] = useState<"forward" | "backward">("forward")
  const [paymentSuccess, setPaymentSuccess] = useState(false)

  // Get currency-specific tax rate
  const effectiveTaxRate = taxRate || getTaxRate(selectedCurrency)

  // Convert plans to current currency
  const convertedPlans = useMemo(() => {
    return plans.map(plan => ({
      ...plan,
      price: convertPrice(plan.price, selectedCurrency)
    }))
  }, [plans, selectedCurrency, version])

  // Update selected plan when currency changes
  useEffect(() => {
    if (selectedPlan) {
      const updatedPlan = convertedPlans.find(p => p.id === selectedPlan.id)
      if (updatedPlan) {
        setSelectedPlan(updatedPlan)
      }
    }
  }, [convertedPlans, selectedPlan])

  const handlePlanSelect = (plan: Plan) => {
    setSelectedPlan(plan)
  }

  const handleNextStep = () => {
    if (currentStep < 3) {
      // If Free plan is selected, skip payment and go directly to completion
      if (selectedPlan?.price === 0 && currentStep === 1) {
        handlePaymentSuccess()
        return
      }
      
      setAnimationDirection("forward")
      setCurrentStep(currentStep + 1)
    }
  }

  const handlePreviousStep = () => {
    if (currentStep > 1) {
      setAnimationDirection("backward")
      setCurrentStep(currentStep - 1)
    }
  }

  const calculateTax = (price: number) => {
    return price * effectiveTaxRate
  }

  const calculateTotal = (price: number) => {
    return price + calculateTax(price)
  }

  const handlePaymentSuccess = () => {
    setPaymentSuccess(true)
    toast.success("Payment successful! Your plan has been upgraded.")
    
    // Call onComplete after a short delay to show success state
    setTimeout(() => {
      if (onComplete && selectedPlan) {
        onComplete(selectedPlan)
      }
    }, 2000)
  }

  const handlePaymentError = (error: string) => {
    toast.error(`Payment failed: ${error}`)
  }

  if (paymentSuccess) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
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
                onClick={() => onComplete?.(selectedPlan!)}
                className={`${getGradientClass('primaryDark')} hover:${getGradientClass('primaryHover')}`}
              >
                Continue to Dashboard
              </Button>
            </motion.div>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <Card className="w-full max-w-6xl max-h-[90vh] overflow-y-auto backdrop-blur-sm bg-black/40 border border-white/10 shadow-xl rounded-xl">
        <CardContent className="p-6">
          <div className="flex flex-col items-center text-center mb-6">
            <motion.div
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1, duration: 0.5 }}
              className="mb-2"
            >
              <Sparkles className="h-6 w-6 text-primary mb-2" />
            </motion.div>
            <motion.h2
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2, duration: 0.5 }}
              className="text-xl md:text-2xl font-bold tracking-tight text-white"
            >
              Upgrade Your Experience
            </motion.h2>
            <motion.p
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3, duration: 0.5 }}
              className="text-muted-foreground mt-2 text-sm"
            >
              Choose the plan that works best for you
            </motion.p>
            
            {/* Currency Selector */}
            <motion.div
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4, duration: 0.5 }}
              className="mt-4"
            >
              <CurrencySelector compact={true} />
            </motion.div>
          </div>

          <StepIndicator currentStep={currentStep} totalSteps={3} />

          <AnimatePresence mode="wait" custom={animationDirection}>
            <motion.div
              key={currentStep}
              custom={animationDirection}
              initial="initial"
              animate="animate"
              exit="exit"
              className="mt-6"
            >
              {currentStep === 1 && (
                <PlanSelection
                  plans={convertedPlans}
                  selectedPlan={selectedPlan}
                  onSelectPlan={handlePlanSelect}
                  billingCycle="monthly"
                  onBillingCycleChange={() => {}}
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

          {currentStep < 3 && (
            <div className="flex justify-between mt-6 pt-4 border-t border-white/10">
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
                    onClick={onCancel}
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
                  className="flex items-center gap-2 bg-primary hover:bg-primary/90"
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
  )
}
