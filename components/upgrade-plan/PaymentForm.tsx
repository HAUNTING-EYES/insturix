"use client";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Shield, CreditCard } from "lucide-react";
import Image from "next/image";
import R from "@/public/razorpay.svg";
import { useState } from "react";
import { useUser } from "@clerk/nextjs";
import { toast } from "@/hooks/use-toast";
import { useCurrency } from "@/lib/CurrencyContext";
import { createSubscription } from "@/lib/services/paymentService";
import { useQueryClient } from "@tanstack/react-query";
import { getGradientClass } from "@/lib/themeConfig";
import { Plan } from "./UpgradePageContent";

interface PaymentFormProps {
  plan: Plan;
  billingCycle: 'monthly' | 'yearly';
  totalAmount: number;
  onPaymentSuccess?: () => void;
  onPaymentError?: (error: string) => void;
}

declare global {
  interface Window {
    Razorpay: any;
  }
}

export function PaymentForm({ plan, billingCycle, totalAmount, onPaymentSuccess, onPaymentError }: PaymentFormProps) {
  const [loading, setLoading] = useState(false);
  const [paymentStatus, setPaymentStatus] = useState<'idle' | 'processing' | 'success' | 'failed'>('idle');
  const { user } = useUser();
  const { selectedCurrency, selectedSymbol } = useCurrency();
  const queryClient = useQueryClient();

  const fadeIn = {
    hidden: { opacity: 0 },
    show: { opacity: 1, transition: { duration: 0.4 } },
  };

  const handlePayment = async () => {
    if (!user) {
      toast({
        title: "Authentication Required",
        description: "Please log in to continue with payment",
        variant: "destructive",
      });
      onPaymentError?.("User not authenticated");
      return;
    }

    setLoading(true);
    setPaymentStatus('processing');

    try {
      toast({
        title: "Creating Order",
        description: "Please wait while we prepare your payment...",
      });

      const checkout = await createSubscription(
        plan.userType,
        {
          id: user.id,
          fullName: user.fullName,
          email: user.primaryEmailAddress?.emailAddress,
        },
        selectedCurrency,
        billingCycle,
        plan.paymentProvider?.provider,
        plan.paymentProvider?.planId
      );

      if (checkout.provider === 'razorpay') {
        if (!window.Razorpay) {
          const script = document.createElement("script");
          script.src = "https://checkout.razorpay.com/v1/checkout.js";
          script.async = true;
          document.body.appendChild(script);
          
          await new Promise((resolve, reject) => {
            script.onload = resolve;
            script.onerror = () => reject(new Error("Failed to load Razorpay script"));
          });
        }

        const options = {
          key: checkout.key,
          subscription_id: checkout.subscriptionId,
          name: "Insturix",
          description: `${plan.name} Subscription`,
          handler: async function (response: any) {
            setPaymentStatus('processing');
            try {
              toast({
                title: "Verifying Subscription",
                description: "Please wait while we confirm your subscription...",
              });

              const verifyResponse = await fetch("/api/verify-subscription", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  razorpay_payment_id: response.razorpay_payment_id,
                  razorpay_subscription_id: response.razorpay_subscription_id,
                  razorpay_signature: response.razorpay_signature,
                  planType: plan.userType,
                  provider: 'razorpay',
                  billingCycle: billingCycle,
                  currency: selectedCurrency,
                }),
              });

              const verifyData = await verifyResponse.json();

              if (verifyData.isOk) {
                setPaymentStatus('success');
                queryClient.invalidateQueries({ queryKey: ["userData"] });
                queryClient.invalidateQueries({ queryKey: ["plans"] });
                toast({
                  title: "Subscription Successful!",
                  description: "Your plan has been upgraded.",
                  variant: "default",
                });
                onPaymentSuccess?.();
              } else {
                setPaymentStatus('failed');
                toast({
                  title: "Subscription Verification Failed",
                  description: verifyData.message || "Please contact support.",
                  variant: "destructive",
                });
                onPaymentError?.(verifyData.message || "Subscription verification failed");
              }
            } catch (error) {
              setPaymentStatus('failed');
              toast({
                title: "Verification Error",
                description: "Subscription verification failed. Please contact support.",
                variant: "destructive",
              });
              onPaymentError?.("Subscription verification failed");
            }
          },
          prefill: {
            name: user.fullName || user.username || "",
            email: user.primaryEmailAddress?.emailAddress || "",
          },
          theme: {
            color: "#3399cc",
            checkout_layout: "desktop"
          },
          modal: {
            ondismiss: function() {
              setPaymentStatus('idle');
              setLoading(false);
              toast({
                title: "Payment Cancelled",
                description: "You cancelled the payment. You can try again anytime.",
              });
            },
          },
        };

        const razorpay = new window.Razorpay(options);
        razorpay.open();
      } else if (checkout.provider === 'lemonsqueezy') {
        window.location.href = checkout.checkoutUrl;
      }
    } catch (error: any) {
      setPaymentStatus('failed');
      setLoading(false);
      console.error("Payment error:", error);
      
      const errorMessage = error.message || "Failed to initiate payment";
      toast({
        title: "Payment Error",
        description: errorMessage,
        variant: "destructive",
      });
      onPaymentError?.(errorMessage);
    }
  };

  return (
    <motion.div
      initial="hidden"
      animate="show"
      variants={fadeIn}
      className="space-y-6"
    >
      <div className="space-y-4">
        <h3 className="text-lg font-medium">Payment Information</h3>

        <div className="text-sm text-white/70 flex items-center p-3 border border-blue-500/20 rounded-lg bg-gradient-to-r from-blue-500/10 to-cyan-500/10 backdrop-blur-sm">
          <Shield className="h-4 w-4 mr-2 text-blue-400" />
          Your payment information is secure and encrypted
        </div>

        <Button
          onClick={handlePayment}
          disabled={loading || paymentStatus === 'processing'}
          className={`w-full font-medium py-3 rounded-lg transition-all duration-300 ${
            paymentStatus === 'success'
              ? `${getGradientClass('success')} hover:opacity-90`
              : paymentStatus === 'failed'
              ? 'bg-gradient-to-r from-red-600 to-red-500 hover:from-red-500 hover:to-red-400'
              : `${getGradientClass('primaryDark')} hover:${getGradientClass('primaryHover')}`
          } text-white shadow-lg`}
        >
          <CreditCard className="h-4 w-4 mr-2" />
          {paymentStatus === 'processing' || loading
            ? "Processing..."
            : paymentStatus === 'success'
            ? "Payment Successful!"
            : paymentStatus === 'failed'
            ? "Payment Failed - Retry"
            : `Pay ${selectedSymbol}${totalAmount.toFixed(2)}`
          }
        </Button>

        {paymentStatus === 'failed' && (
          <div className="text-sm text-red-400 text-center mt-2">
            Payment failed. Please try again or contact support if the issue persists.
          </div>
        )}

        {paymentStatus === 'success' && (
          <div className="text-sm text-green-400 text-center mt-2">
            Payment completed successfully! Your plan will be updated shortly.
          </div>
        )}

        <div className="flex items-center text-sm text-white/70 mt-4">
          {plan.paymentProvider?.provider === 'razorpay' && (
            <Image
              src={R}
              alt="Razorpay"
              className="h-5 mr-2 bg-white rounded px-1"
            />
          )}
          Payments are powered by {plan.paymentProvider?.provider === 'razorpay' ? 'Razorpay' : 'Lemon Squeezy'}
        </div>
      </div>
    </motion.div>
  );
}
