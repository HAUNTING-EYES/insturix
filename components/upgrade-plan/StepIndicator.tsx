"use client"

import { motion } from "framer-motion"
import { cn } from "@/lib/utils"
import { PLAN_THEME, getGradientClass } from "@/lib/themeConfig"

interface StepIndicatorProps {
  currentStep: number
  totalSteps: number
}

export function StepIndicator({ currentStep }: StepIndicatorProps) {
  const steps = [
    { number: 1, label: "Select Plan" },
    { number: 2, label: "Review" },
    { number: 3, label: "Payment" },
  ]

  return (
    <div className="my-6">
      <div className="flex items-center justify-between">
        {steps.map((step, index) => (
          <div key={step.number} className="flex flex-col items-center relative w-full">
            {/* Connector line */}
            {index < steps.length - 1 && (
              <div className="absolute top-4 left-1/2 w-full h-1 bg-white/10 -z-10">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{
                    width: currentStep > step.number ? "100%" : "0%",
                  }}
                  transition={{ duration: 0.5, ease: "easeInOut" }}
                  className={`h-full bg-gradient-to-r ${PLAN_THEME.gradients.primary}`}
                />
              </div>
            )}

            {/* Step circle */}
            <div
              className={cn(
                "relative flex items-center justify-center w-8 h-8 rounded-full border-2 text-sm font-medium transition-all duration-300",
                currentStep === step.number
                  ? `border-transparent ${getGradientClass('primary')} text-white shadow-lg`
                  : currentStep > step.number
                    ? `border-transparent ${getGradientClass('success')} text-white shadow-lg`
                    : "border-white/20 bg-black/40 text-white/60",
              )}
            >
              {currentStep > step.number ? (
                <motion.svg
                  initial={{ opacity: 0, scale: 0.5 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.3 }}
                  className="w-4 h-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <motion.path
                    initial={{ pathLength: 0 }}
                    animate={{ pathLength: 1 }}
                    transition={{ duration: 0.3, delay: 0.1 }}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={3}
                    d="M5 13l4 4L19 7"
                  />
                </motion.svg>
              ) : (
                <span>{step.number}</span>
              )}

            </div>

            {/* Step label */}
            <motion.span
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: 0.1 * step.number }}
              className={cn(
                "mt-2 text-sm font-medium",
                currentStep === step.number
                  ? `bg-gradient-to-r ${PLAN_THEME.gradients.primary} bg-clip-text text-transparent`
                  : currentStep > step.number
                    ? `bg-gradient-to-r ${PLAN_THEME.gradients.success} bg-clip-text text-transparent`
                    : "text-white/60",
              )}
            >
              {step.label}
            </motion.span>
          </div>
        ))}
      </div>
    </div>
  )
}
