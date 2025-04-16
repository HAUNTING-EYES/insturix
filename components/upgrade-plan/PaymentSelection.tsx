"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Check, Sparkles } from "lucide-react";
import type { Plan } from "./upgrade-plan";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

interface PlanSelectionProps {
  plans: Plan[];
  selectedPlan: Plan | null;
  onSelectPlan: (plan: Plan) => void;
  billingCycle: "monthly" | "yearly";
  onBillingCycleChange: (cycle: "monthly" | "yearly") => void;
}

export function PlanSelection({
  plans,
  selectedPlan,
  onSelectPlan,
  billingCycle,
  onBillingCycleChange,
}: PlanSelectionProps) {
  const [hoveredPlan, setHoveredPlan] = useState<string | null>(null);

  const handleBillingToggle = () => {
    onBillingCycleChange(billingCycle === "monthly" ? "yearly" : "monthly");
  };

  // Animation variants
  const cardVariants = {
    initial: { opacity: 0, y: 20 },
    animate: (index: number) => ({
      opacity: 1,
      y: 0,
      transition: {
        delay: 0.05 * index,
        duration: 0.5,
        ease: "easeOut",
      },
    }),
    hover: {
      y: -10,
      transition: {
        duration: 0.3,
        ease: "easeOut",
      },
    },
    tap: {
      y: -5,
      transition: {
        duration: 0.1,
        ease: "easeOut",
      },
    },
  };

  const featureVariants = {
    initial: { opacity: 0, x: -10 },
    animate: (index: number) => ({
      opacity: 1,
      x: 0,
      transition: {
        delay: 0.03 * index,
        duration: 0.3,
      },
    }),
  };

  return (
    <div className="space-y-8">
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
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
            className="data-[state=checked]:bg-gradient-to-r data-[state=checked]:from-violet-600 data-[state=checked]:to-pink-600"
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
        <div className="flex items-center">
          <Label
            htmlFor="billing-toggle"
            className={cn(
              "transition-colors duration-200",
              billingCycle === "yearly" ? "text-white" : "text-white/60"
            )}
          >
            Yearly
          </Label>
          {billingCycle === "yearly" && (
            <motion.span
              initial={{ opacity: 0, scale: 0.8, x: 10 }}
              animate={{ opacity: 1, scale: 1, x: 0 }}
              transition={{ duration: 0.3, delay: 0.1 }}
              className="ml-2 text-xs font-medium bg-gradient-to-r from-violet-600 to-pink-600 px-2 py-0.5 rounded-full"
            >
              Save 16%
            </motion.span>
          )}
        </div>
      </motion.div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6">
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
                  "h-full cursor-pointer transition-all duration-300 backdrop-blur-sm bg-black/40 border-white/10 overflow-hidden",
                  selectedPlan?.id === plan.id
                    ? "ring-2 ring-primary"
                    : hoveredPlan === plan.id
                      ? "border-white/20"
                      : "border-white/10",
                  plan.popularPlan ? "relative" : ""
                )}
                onClick={() => onSelectPlan(plan)}
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

                {plan.popularPlan && (
                  <div className="absolute -top-px left-0 right-0">
                    <div className="h-1 bg-gradient-to-r from-violet-500 via-fuchsia-500 to-pink-500" />
                    <div className="flex justify-center">
                      <motion.div
                        initial={{ y: -20, opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        transition={{ delay: 0.2, duration: 0.3 }}
                        className="bg-gradient-to-r from-violet-500 to-pink-500 text-white text-xs font-medium px-3 py-1 rounded-b-md shadow-lg flex items-center gap-1"
                      >
                        <Sparkles className="h-3 w-3" />
                        Most Popular
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
                        <span className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-violet-400 to-pink-400">
                          ${plan.price.toFixed(2)}
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
                          Save ${plan.savings.toFixed(2)} per year
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
                                    ? "bg-gradient-to-r from-violet-500 to-pink-500 text-white"
                                    : "bg-primary/20 text-primary"
                                  : "bg-white/10 text-white/40"
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
                                    ? "text-white font-medium"
                                    : "text-white/90"
                                  : "text-white/50"
                              )}
                            >
                              {feature.name}
                            </span>
                          </motion.div>
                        </li>
                      ))}
                    </ul>
                  </motion.div>
                </CardContent>

                <CardFooter className="p-6 pt-0">
                  <Button
                    variant={
                      selectedPlan?.id === plan.id ? "default" : "outline"
                    }
                    className={cn(
                      "w-full transition-all duration-300",
                      selectedPlan?.id === plan.id
                        ? "bg-gradient-to-r from-violet-600 to-pink-600 hover:from-violet-500 hover:to-pink-500 text-white border-0"
                        : "bg-transparent border-white/20 hover:bg-white/10 text-white"
                    )}
                    onClick={() => onSelectPlan(plan)}
                  >
                    {selectedPlan?.id === plan.id ? "Selected" : "Select Plan"}
                  </Button>
                </CardFooter>
              </Card>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}
