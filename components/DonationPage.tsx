"use client";

import type React from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { motion } from "framer-motion";
import { Heart, Sparkles, Shield, Coffee } from "lucide-react";
import DonationDialog from "./DonationDialog";
import { useToast } from "@/hooks/use-toast";
import Script from "next/script";
import { Currency } from "./Currency";
import { useQuery, useMutation } from "@tanstack/react-query";
import { fetchLocationData } from "../lib/Location";
import axios from "axios";

interface RazorpayOptions {
  key: string;
  order_id: string;
  handler: (response: {
    razorpay_order_id: string;
    razorpay_payment_id: string;
    razorpay_signature: string;
  }) => void;
}

interface WindowWithRazorpay extends Window {
  Razorpay: new (options: RazorpayOptions) => RazorpayInstance;
}

interface RazorpayInstance {
  open: () => void;
}

interface DonationOption {
  amountUSD: number;
  amountINR: number;
  amountEUR: number;
  amountGBP: number;
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
  title: string;
  description: string;
  color: string;
  iconColor: string;
  popularTag: boolean;
}

const donationOptions: DonationOption[] = [
  {
    amountUSD: 5,
    amountINR: 399,
    amountEUR: 4,
    amountGBP: 3.5,
    icon: Coffee,
    title: "Buy us a coffee",
    description: "Support our daily grind with a cup of motivation",
    color: "bg-amber-500/10 dark:bg-amber-500/5",
    iconColor: "text-amber-500",
    popularTag: false,
  },
  {
    amountUSD: 10,
    amountINR: 799,
    amountEUR: 8,
    amountGBP: 7,
    icon: Heart,
    title: "Show Some Love",
    description: "Help us maintain and improve our platform",
    color: "bg-red-500/10 dark:bg-red-500/5",
    iconColor: "text-red-500",
    popularTag: true,
  },
  {
    amountUSD: 25,
    amountINR: 1999,
    amountEUR: 20,
    amountGBP: 18,
    icon: Shield,
    title: "Become a Guardian",
    description: "Ensure our platform's stability and security",
    color: "bg-blue-500/10 dark:bg-blue-500/5",
    iconColor: "text-blue-500",
    popularTag: false,
  },
  {
    amountUSD: 50,
    amountINR: 3999,
    amountEUR: 40,
    amountGBP: 35,
    icon: Sparkles,
    title: "Power Innovation",
    description: "Fuel new features and exciting developments",
    color: "bg-purple-500/10 dark:bg-purple-500/5",
    iconColor: "text-purple-500",
    popularTag: false,
  },
];

// API functions
const createOrder = async ({
  amount,
  currency,
}: {
  amount: number;
  currency: string;
}) => {
  const { data } = await axios.post("/api/create-orders", { amount, currency });
  return data;
};

const verifyOrder = async ({
  orderId,
  razorpayPaymentId,
  razorpaySignature,
}: {
  orderId: string;
  razorpayPaymentId: string;
  razorpaySignature: string;
}) => {
  const { data } = await axios.post("/api/verify-orders", {
    orderId,
    razorpayPaymentId,
    razorpaySignature,
  });
  return data;
};

export default function DonationPage() {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const { toast } = useToast();

  const { data: locationData } = useQuery({
    queryKey: ["location"],
    queryFn: fetchLocationData,
  });

  const createOrderMutation = useMutation({
    mutationFn: createOrder,
    onSuccess: (data) => {
      // Handle successful order creation
      initializePayment(data);
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error.message,
        duration: 5000,
      });
    },
  });

  const verifyOrderMutation = useMutation({
    mutationFn: verifyOrder,
    onSuccess: (data) => {
      if (data.isOk) {
        toast({
          title: "Payment Made Successfully",
          description: `You have donated ${locationData?.symbol}${data.amount}`,
          duration: 5000,
        });
      } else {
        toast({
          title: "Payment Failed",
          description: `Please try again later`,
          duration: 5000,
        });
      }
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error.message,
        duration: 5000,
      });
    },
  });

  const initializePayment = (orderData: {
    id: string;
    currency: string;
    amount: number;
  }) => {
    const paymentData = {
      key: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID || "",
      order_id: orderData.id,
      currency: orderData.currency,
      amount: orderData.amount,
      handler: (response: {
        razorpay_order_id: string;
        razorpay_payment_id: string;
        razorpay_signature: string;
      }) => {
        verifyOrderMutation.mutate({
          orderId: response.razorpay_order_id,
          razorpayPaymentId: response.razorpay_payment_id,
          razorpaySignature: response.razorpay_signature,
        });
      },
    };

    const payment = new (window as unknown as WindowWithRazorpay).Razorpay(
      paymentData
    ) as RazorpayInstance;
    payment.open();
  };

  const handleDonate = async (amount: number) => {
    if (!locationData) {
      toast({
        title: "Error",
        description: "Unable to determine your location. Please try again.",
        duration: 5000,
      });
      return;
    }

    createOrderMutation.mutate({ amount, currency: locationData.currency });
  };

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-[rgb(var(--surface-0))] relative flex items-center">
      {/* Background pattern */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute inset-0 opacity-[0.03]">
          <svg className="w-full h-full">
            <pattern
              id="grid"
              width="32"
              height="32"
              patternUnits="userSpaceOnUse"
            >
              <path
                d="M0 .5H32M.5 0V32"
                fill="none"
                stroke="currentColor"
                strokeWidth="1"
              />
            </pattern>
            <rect width="100%" height="100%" fill="url(#grid)" />
          </svg>
        </div>
      </div>

      <div className="container mx-auto px-4 py-8 md:py-16 relative">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="max-w-5xl mx-auto"
        >
          <h1 className="text-2xl md:text-3xl font-semibold mb-2 relative">
            Support Our Mission
            <div className="absolute -top-1.5 -left-3 w-12 h-12 bg-blue-500/10 rounded-full blur-xl" />
          </h1>
          <p className="text-sm md:text-base text-zinc-600 dark:text-zinc-400 mb-8 md:mb-12">
            Your support helps us create better tools and experiences for
            everyone. Choose a contribution that feels right for you.
          </p>
          <Script
            type="text/javascript"
            src="https://checkout.razorpay.com/v1/checkout.js"
          />

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
            {donationOptions.map((option, index) => (
              <motion.div
                key={option.title}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.1 + 0.2 }}
              >
                <motion.div
                  whileHover={{ scale: 1.02, y: -4 }}
                  whileTap={{ scale: 0.98 }}
                  className="h-full relative"
                >
                  <Card className="p-4 md:p-6 h-full bg-white/50 dark:bg-[rgb(var(--surface-1))]/50 backdrop-blur-xs border-zinc-200/40 dark:border-[rgb(var(--border-light))]/20 transition-all duration-300 group">
                    {option.popularTag && (
                      <div className="absolute -top-3 -right-2 bg-blue-500 text-white text-xs py-1 px-3 rounded-full shadow-lg">
                        Popular
                      </div>
                    )}
                    <div
                      className={`w-12 h-12 rounded-lg ${option.color} flex items-center justify-center mb-4`}
                    >
                      <option.icon className={`w-6 h-6 ${option.iconColor}`} />
                    </div>
                    <h3 className="text-lg font-medium mb-2 group-hover:text-blue-500 transition-colors">
                      {option.title}
                    </h3>
                    <p className="text-sm text-zinc-600 dark:text-zinc-400 mb-4">
                      {option.description}
                    </p>
                    <Button
                      className="w-full bg-zinc-900 hover:bg-zinc-800 dark:bg-blue-600 dark:hover:bg-blue-500 transition-colors duration-300"
                      onClick={() => handleDonate(option.amountUSD)}
                    >
                      <Currency
                        priceUSD={option.amountUSD}
                        priceINR={option.amountINR}
                        priceEUR={option.amountEUR}
                        priceGBP={option.amountGBP}
                        className="inline-block"
                      />
                    </Button>
                  </Card>
                </motion.div>
              </motion.div>
            ))}
          </div>

          {/* Custom amount section */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.6 }}
            className="mt-8 text-center"
          >
            <Button
              variant="ghost"
              className="text-blue-500 hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-300"
              onClick={() => setIsDialogOpen(true)}
            >
              Enter custom amount
            </Button>
          </motion.div>
        </motion.div>
      </div>

      {/* Custom amount dialog */}
      <DonationDialog
        isOpen={isDialogOpen}
        onClose={() => setIsDialogOpen(false)}
        onDonate={handleDonate}
      />

      {/* Decorative gradient orbs */}
      <div className="fixed top-1/4 -left-48 w-96 h-96 bg-amber-500/10 dark:bg-amber-500/5 rounded-full blur-3xl" />
      <div className="fixed bottom-1/4 -right-48 w-96 h-96 bg-purple-500/10 dark:bg-purple-500/5 rounded-full blur-3xl" />
    </div>
  );
}
