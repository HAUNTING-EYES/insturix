"use client";
import { motion } from "framer-motion";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Lock, Shield, CreditCard } from "lucide-react";
import Image from "next/image";
import R from "@/public/razorpay.svg";
import { useState } from "react";
import { useUser } from "@clerk/nextjs";
import { toast } from "@/hooks/use-toast";
import { useCurrency } from "@/lib/CurrencyContext";
import { getRazorpayOptions, convertCurrencyForRazorpay } from "@/lib/razorpayConfig";
import { UserType } from "@/types/userTypes";
import { useQueryClient } from "@tanstack/react-query";
import { PLAN_THEME, getGradientClass } from "@/lib/themeConfig";

interface Plan {
  name: string;
  price: number;
  userType: UserType;
  features: Array<{ name: string; included: boolean }>;
}

interface PaymentFormProps {
  plan: Plan;
  totalAmount: number;
  onPaymentSuccess?: () => void;
  onPaymentError?: (error: string) => void;
}

declare global {
  interface Window {
    Razorpay: any;
  }
}

export function PaymentForm({ plan, totalAmount, onPaymentSuccess, onPaymentError }: PaymentFormProps) {
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

      // Convert currency if needed for Razorpay
      const { amount: razorpayAmount, currency: razorpayCurrency } = convertCurrencyForRazorpay(
        totalAmount,
        selectedCurrency
      );

      // Create order
      const orderResponse = await fetch("/api/create-order", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          amount: razorpayAmount,
          currency: razorpayCurrency,
          originalAmount: totalAmount,
          originalCurrency: selectedCurrency,
          planDetails: {
            name: plan.name,
            userType: plan.userType,
            price: plan.price,
            currency: selectedCurrency,
            features: plan.features.filter(f => f.included).map(f => f.name),
          },
        }),
      });

      if (!orderResponse.ok) {
        const errorData = await orderResponse.json();
        throw new Error(errorData.error || "Failed to create order");
      }

      const orderData = await orderResponse.json();

      // Load Razorpay script if not already loaded
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

      // Initialize Razorpay payment with enhanced options
      const options = getRazorpayOptions(
        orderData.orderId,
        orderData.amount,
        orderData.currency,
        {
          name: user.fullName || user.username || "",
          email: user.primaryEmailAddress?.emailAddress || "",
        },
        plan.name
      );

      // Add payment success handler
      options.handler = async function (response: any) {
        setPaymentStatus('processing');
        try {
          toast({
            title: "Verifying Payment",
            description: "Please wait while we confirm your payment...",
          });

          // Verify payment
          const verifyResponse = await fetch("/api/verify-orders", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              orderId: orderData.orderId,
              razorpayPaymentId: response.razorpay_payment_id,
              razorpaySignature: response.razorpay_signature,
              planDetails: {
                userType: plan.userType,
                price: plan.price,
                features: plan.features.filter(f => f.included).map(f => f.name),
              },
            }),
          });

          const verifyData = await verifyResponse.json();

          if (verifyData.isOk) {
            setPaymentStatus('success');
            
            // Invalidate React Query caches to refresh user data in sidebar
            queryClient.invalidateQueries({ queryKey: ["userData"] });
            queryClient.invalidateQueries({ queryKey: ["plans"] });
            
            toast({
              title: "Payment Successful!",
              description: "Your plan has been upgraded successfully.",
              variant: "default",
            });
            onPaymentSuccess?.();
          } else {
            setPaymentStatus('failed');
            toast({
              title: "Payment Verification Failed",
              description: verifyData.message || "Please contact support if payment was deducted.",
              variant: "destructive",
            });
            onPaymentError?.(verifyData.message || "Payment verification failed");
          }
        } catch (error) {
          setPaymentStatus('failed');
          toast({
            title: "Verification Error",
            description: "Payment verification failed. Please contact support if payment was deducted.",
            variant: "destructive",
          });
          onPaymentError?.("Payment verification failed");
        }
      };

      // Override the modal dismiss handler to provide feedback
      options.modal.ondismiss = function() {
        setPaymentStatus('idle');
        setLoading(false);
        toast({
          title: "Payment Cancelled",
          description: "You cancelled the payment. You can try again anytime.",
        });
      };

      const razorpay = new window.Razorpay(options);
      
      razorpay.on('payment.failed', function (response: any) {
        setPaymentStatus('failed');
        setLoading(false);
        toast({
          title: "Payment Failed",
          description: response.error.description || "Payment could not be processed. Please try again.",
          variant: "destructive",
        });
        onPaymentError?.(response.error.description || "Payment failed");
      });

      razorpay.open();
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
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
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
            <Image
              src={R}
              alt="Razorpay"
              className="h-5 mr-2 bg-white rounded px-1"
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
                    {plan.name} Plan
                  </span>
                  <span className={`font-medium bg-gradient-to-r ${PLAN_THEME.gradients.primary} bg-clip-text text-transparent`}>
                    {selectedSymbol}{plan.price.toFixed(2)}
                  </span>
                </div>

                <Separator className="bg-white/10" />

                <div className="flex justify-between font-bold">
                  <span>Total to pay now</span>
                  <span className={`text-lg font-bold bg-gradient-to-r ${PLAN_THEME.gradients.accent} bg-clip-text text-transparent`}>
                    {selectedSymbol}{totalAmount.toFixed(2)}
                  </span>
                </div>

                <div className="flex justify-between items-center pt-4">
                  <div className="flex items-center">
                    <Lock className="h-4 w-4 mr-1 text-green-400" />
                    <span className="text-xs text-white/70">Secure Payment</span>
                  </div>
                </div>
                
                <div className="text-xs text-white/60 text-center mt-2">
                  By proceeding with payment, you agree to our Terms of Service
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </motion.div>
  );
}
