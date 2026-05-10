"use client";

import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Tag, X, CheckCircle } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { AppliedCoupon } from "@/lib/services/couponService";

interface CouponInputProps {
  amount: number;
  currency: string;
  onCouponApplied: (coupon: AppliedCoupon | null) => void;
  appliedCoupon: AppliedCoupon | null;
}

export function CouponInput({ 
  amount, 
  currency, 
  onCouponApplied, 
  appliedCoupon 
}: CouponInputProps) {
  const [couponCode, setCouponCode] = useState("");
  const [isValidating, setIsValidating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showInput, setShowInput] = useState(false);

  // Only show for INR currency
  if (currency !== 'INR') {
    return null;
  }

  const validateCoupon = async () => {
    if (!couponCode.trim()) {
      setError("Please enter a coupon code");
      return;
    }

    setIsValidating(true);
    setError(null);

    try {
      const response = await fetch("/api/coupons/validate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          code: couponCode.trim(),
          amount,
          currency,
        }),
      });

      const data = await response.json();

      if (data.success) {
        onCouponApplied(data.coupon);
        setShowInput(false);
        setCouponCode("");
        setError(null);
      } else {
        setError(data.error || "Invalid coupon code");
      }
    } catch (error) {
      console.error("Error validating coupon:", error);
      setError("Failed to validate coupon. Please try again.");
    } finally {
      setIsValidating(false);
    }
  };

  const removeCoupon = () => {
    onCouponApplied(null);
    setCouponCode("");
    setError(null);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      validateCoupon();
    }
  };

  return (
    <div className="space-y-3">
      <AnimatePresence>
        {appliedCoupon ? (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="flex items-center justify-between p-3 bg-green-500/10 border border-green-500/20 rounded-lg"
          >
            <div className="flex items-center space-x-2">
              <CheckCircle className="h-4 w-4 text-green-500" />
              <div>
                <p className="text-sm font-medium text-green-400">
                  Coupon Applied: {appliedCoupon.code}
                </p>
                <p className="text-[11px] text-green-300">
                  {appliedCoupon.description}
                </p>
                <p className="text-[11px] text-green-300">
                  Discount: ₹{appliedCoupon.discount.amount}
                </p>
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={removeCoupon}
              className="text-green-400 hover:text-green-300 hover:bg-green-500/10"
            >
              <X className="h-4 w-4" />
            </Button>
          </motion.div>
        ) : (
          <>
            {!showInput ? (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              >
                <Button
                  variant="outline"
                  onClick={() => setShowInput(true)}
                  className="w-full bg-transparent border-white/20 hover:bg-white/10 text-white"
                >
                  <Tag className="h-4 w-4 mr-2" />
                  Have a coupon code?
                </Button>
              </motion.div>
            ) : (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-2"
              >
                <div className="flex space-x-2">
                  <Input
                    placeholder="Enter coupon code"
                    value={couponCode}
                    onChange={(e) => {
                      setCouponCode(e.target.value.toUpperCase());
                      setError(null);
                    }}
                    onKeyPress={handleKeyPress}
                    className="flex-1 bg-white/5 border-white/20 text-white placeholder:text-white/50"
                    disabled={isValidating}
                  />
                  <Button
                    onClick={validateCoupon}
                    disabled={isValidating || !couponCode.trim()}
                    className="bg-blue-600 hover:bg-blue-700 text-white"
                  >
                    {isValidating ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      "Apply"
                    )}
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={() => {
                      setShowInput(false);
                      setCouponCode("");
                      setError(null);
                    }}
                    className="text-white/70 hover:text-white hover:bg-white/10"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
                
                {error && (
                  <motion.p
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="text-sm text-red-400"
                  >
                    {error}
                  </motion.p>
                )}
              </motion.div>
            )}
          </>
        )}
      </AnimatePresence>
    </div>
  );
}