"use client";
import { motion } from "framer-motion";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Lock, Shield } from "lucide-react";
import Image from "next/image";
import R from "@/public/razorpay.svg"

interface Plan {
  name: string;
  price: number;
  billingPeriod: string;
}

interface PaymentFormProps {
  plan: Plan;
  totalAmount: number;
}

export function PaymentForm({ plan, totalAmount }: PaymentFormProps) {
  // Simplified animation variants
  const fadeIn = {
    hidden: { opacity: 0 },
    show: { opacity: 1, transition: { duration: 0.4 } },
  };

  return (
    <motion.div
      initial="hidden"
      animate="show"
      variants={fadeIn}
      className="space-y-6"
    >
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-4">
          <h3 className="text-lg font-medium">Payment Information</h3>

          <div className="text-sm text-white/70 flex items-center p-3 border border-white/10 rounded-lg bg-white/5 backdrop-blur-sm">
            <Shield className="h-4 w-4 mr-2 text-primary" />
            Your payment information is secure and encrypted
          </div>

          <div className="flex items-center text-sm text-white/70 mt-4">
            <Image
              src={R}
              alt="Razorpay"
              className="h-5 mr-2 bg-white"
            />
            Payments are powered by Razorpay
          </div>
        </div>

        <div>
          <Card className="backdrop-blur-sm bg-black/40 border-white/10 overflow-hidden">
            <CardContent className="p-6">
              <h4 className="font-medium text-lg mb-4">Order Summary</h4>

              <div className="space-y-4">
                <div className="flex justify-between">
                  <span className="text-white/60">
                    {plan.name} Plan ({plan.billingPeriod})
                  </span>
                  <span className="font-medium">${plan.price.toFixed(2)}</span>
                </div>

                <Separator className="bg-white/10" />

                <div className="flex justify-between font-bold">
                  <span>Total to pay now</span>
                  <span className="text-lg bg-clip-text text-transparent bg-gradient-to-r from-violet-400 to-pink-400">
                    ${totalAmount.toFixed(2)}
                  </span>
                </div>

                <div className="flex justify-between items-center pt-4">
                  <div className="flex items-center">
                    <Lock className="h-4 w-4 mr-1 text-primary" />
                    <span className="text-xs text-white/70">Secure</span>
                  </div>
                </div>
                <div className="text-xs text-white/60 text-center mt-2">
                  By clicking Complete Payment , you agree to our Terms of
                  Service
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </motion.div>
  );
}
