"use client"

import { motion } from "framer-motion"
import { Check, Shield, Zap, Clock } from "lucide-react"
import type { Plan } from "./upgrade-plan"
import { Card, CardContent } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { cn } from "@/lib/utils"

interface PlanSummaryProps {
  plan: Plan
  taxRate: number
  taxAmount: number
  totalAmount: number
}

export function PlanSummary({ plan, taxRate, taxAmount, totalAmount }: PlanSummaryProps) {
  // Animation variants
  const containerVariants = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1,
      },
    },
  }

  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    show: { opacity: 1, y: 0, transition: { duration: 0.4 } },
  }

  const listItemVariants = {
    hidden: { opacity: 0, x: -10 },
    show: (i: number) => ({
      opacity: 1,
      x: 0,
      transition: {
        delay: 0.1 + i * 0.05,
        duration: 0.3,
      },
    }),
  }

  return (
    <motion.div variants={containerVariants} initial="hidden" animate="show" className="space-y-8">
      <motion.h3 variants={itemVariants} className="text-lg font-medium">
        Order Summary
      </motion.h3>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <motion.div variants={itemVariants}>
          <Card className="backdrop-blur-sm bg-black/40 border-white/10 overflow-hidden">
            <CardContent className="p-6">
              <motion.h4 variants={itemVariants} className="font-medium text-lg mb-4">
                Plan Details
              </motion.h4>

              <motion.div variants={containerVariants} className="space-y-4">
                <motion.div variants={itemVariants} className="flex justify-between">
                  <span className="text-white/60">Plan</span>
                  <span className="font-medium">{plan.name}</span>
                </motion.div>

                <motion.div variants={itemVariants} className="flex justify-between">
                  <span className="text-white/60">Billing</span>
                  <span className="font-medium capitalize">{plan.billingPeriod}</span>
                </motion.div>

                <Separator className="bg-white/10" />

                <motion.div variants={itemVariants} className="flex justify-between">
                  <span className="text-white/60">Subtotal</span>
                  <span className="font-medium">${plan.price.toFixed(2)}</span>
                </motion.div>

                <motion.div variants={itemVariants} className="flex justify-between">
                  <span className="text-white/60">Tax ({(taxRate * 100).toFixed(0)}%)</span>
                  <span className="font-medium">${taxAmount.toFixed(2)}</span>
                </motion.div>

                <Separator className="bg-white/10" />

                <motion.div variants={itemVariants} className="flex justify-between">
                  <span className="font-medium">Total</span>
                  <span className="font-bold text-lg bg-clip-text text-transparent bg-gradient-to-r from-violet-400 to-pink-400">
                    ${totalAmount.toFixed(2)}
                  </span>
                </motion.div>

                {plan.savings && (
                  <motion.div
                    variants={itemVariants}
                    className="bg-gradient-to-r from-green-900/30 to-emerald-900/30 border border-green-500/20 text-green-400 p-3 rounded-md text-sm flex items-center"
                  >
                    <Zap className="h-4 w-4 mr-2 text-green-400" />
                    You&apos;re saving ${plan.savings.toFixed(2)} with annual billing!
                  </motion.div>
                )}
              </motion.div>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div variants={itemVariants}>
          <motion.h4 variants={itemVariants} className="font-medium text-lg mb-4">
            What&apos;s included:
          </motion.h4>
          <motion.ul variants={containerVariants} className="space-y-3">
            {plan.features
              .filter((feature) => feature.included)
              .map((feature, index) => (
                <motion.li key={feature.id} custom={index} variants={listItemVariants} className="flex items-start">
                  <div
                    className={cn(
                      "mr-2 mt-0.5 flex h-5 w-5 items-center justify-center rounded-full",
                      feature.highlight
                        ? "bg-gradient-to-r from-violet-500 to-pink-500 text-white"
                        : "bg-primary/20 text-primary",
                    )}
                  >
                    <Check className="h-3.5 w-3.5" />
                  </div>
                  <span>{feature.name}</span>
                </motion.li>
              ))}
          </motion.ul>

          <motion.div
            variants={itemVariants}
            className="mt-6 p-4 rounded-lg border border-white/10 bg-white/5 backdrop-blur-sm"
          >
            <div className="flex items-start">
              <Shield className="h-5 w-5 mr-3 text-primary mt-0.5" />
              <div>
                <h5 className="font-medium mb-1">Secure Subscription</h5>
                <p className="text-sm text-white/70">
                  Your subscription is protected with enterprise-grade security and can be canceled anytime.
                </p>
              </div>
            </div>
          </motion.div>

          <motion.div
            variants={itemVariants}
            className="mt-4 p-4 rounded-lg border border-white/10 bg-white/5 backdrop-blur-sm"
          >
            <div className="flex items-start">
              <Clock className="h-5 w-5 mr-3 text-primary mt-0.5" />
              <div>
                <h5 className="font-medium mb-1">Instant Access</h5>
                <p className="text-sm text-white/70">
                  Get immediate access to all features after completing your payment.
                </p>
              </div>
            </div>
          </motion.div>
        </motion.div>
      </div>
    </motion.div>
  )
}
