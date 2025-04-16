import type React from "react";
import { motion } from "framer-motion";
import type { Plan } from "./upgrade-plan";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Lock, Shield } from "lucide-react";

interface PaymentFormProps {
  plan: Plan;
  totalAmount: number;
}

export function PaymentForm({ plan, totalAmount }: PaymentFormProps) {
  // Animation variants
  const containerVariants = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1,
      },
    },
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    show: { opacity: 1, y: 0, transition: { duration: 0.4 } },
  };

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="show"
      className="space-y-8"
    >
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <motion.div variants={itemVariants} className="space-y-6">
          <motion.h3 variants={itemVariants} className="text-lg font-medium">
            Payment Information
          </motion.h3>

          <motion.div
            variants={itemVariants}
            className="text-sm text-white/70 flex items-center p-3 border border-white/10 rounded-lg bg-white/5 backdrop-blur-sm"
          >
            <Shield className="h-4 w-4 mr-2 text-primary" />
            Your payment information is secure and encrypted
          </motion.div>
        </motion.div>

        <motion.div variants={itemVariants}>
          <Card className="backdrop-blur-sm bg-black/40 border-white/10 overflow-hidden">
            <CardContent className="p-6">
              <motion.h4
                variants={itemVariants}
                className="font-medium text-lg mb-4"
              >
                Order Summary
              </motion.h4>

              <motion.div variants={containerVariants} className="space-y-4">
                <motion.div
                  variants={itemVariants}
                  className="flex justify-between"
                >
                  <span className="text-white/60">
                    {plan.name} Plan ({plan.billingPeriod})
                  </span>
                  <span className="font-medium">${plan.price.toFixed(2)}</span>
                </motion.div>

                <Separator className="bg-white/10" />

                <motion.div
                  variants={itemVariants}
                  className="flex justify-between font-bold"
                >
                  <span>Total to pay now</span>
                  <span className="text-lg bg-clip-text text-transparent bg-gradient-to-r from-violet-400 to-pink-400">
                    ${totalAmount.toFixed(2)}
                  </span>
                </motion.div>

                <motion.div
                  variants={itemVariants}
                  className="text-sm text-white/70 mt-4"
                >
                  By clicking &quot;Complete Payment&quot;, you agree to our
                  Terms of Service and authorize us to charge your card for this
                  payment and future payments in accordance with our terms.
                </motion.div>

                {/* Payment security badges */}
                <motion.div
                  variants={itemVariants}
                  className="flex justify-between items-center mt-4 pt-4 border-t border-white/10"
                >
                  <div className="flex space-x-2">
                    <div className="w-10 h-6 bg-white/10 rounded flex items-center justify-center">
                      <motion.span
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: 0.5, duration: 0.5 }}
                        className="text-xs font-bold text-white/80"
                      >
                        VISA
                      </motion.span>
                    </div>
                    <div className="w-10 h-6 bg-white/10 rounded flex items-center justify-center">
                      <motion.span
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: 0.6, duration: 0.5 }}
                        className="text-xs font-bold text-white/80"
                      >
                        MC
                      </motion.span>
                    </div>
                    <div className="w-10 h-6 bg-white/10 rounded flex items-center justify-center">
                      <motion.span
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: 0.7, duration: 0.5 }}
                        className="text-xs font-bold text-white/80"
                      >
                        AMEX
                      </motion.span>
                    </div>
                  </div>
                  <div className="flex items-center">
                    <Lock className="h-4 w-4 mr-1 text-primary" />
                    <span className="text-xs text-white/70">
                      Secure Payment
                    </span>
                  </div>
                </motion.div>
              </motion.div>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </motion.div>
  );
}
