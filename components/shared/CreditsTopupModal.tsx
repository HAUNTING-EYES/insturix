"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Coins, Check, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface CreditPackage {
  id: string;
  name: string;
  credits: number;
  prices: Record<string, number>;
}

interface TopupModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export function CreditsTopupModal({ isOpen, onClose, onSuccess }: TopupModalProps) {
  const [packages, setPackages] = useState<CreditPackage[]>([]);
  const [selectedPackage, setSelectedPackage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [purchasing, setPurchasing] = useState(false);
  const [currency, setCurrency] = useState('USD');

  useEffect(() => {
    if (isOpen) {
      fetchPackages();
    }
  }, [isOpen]);

  const fetchPackages = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/user/credits/topup');
      const data = await res.json();
      if (data.success) {
        setPackages(data.packages);
        if (data.packages.length > 0) {
          setSelectedPackage(data.packages[1]?.id || data.packages[0]?.id);
        }
      }
    } catch (err) {
      console.error('Failed to fetch packages:', err);
    } finally {
      setLoading(false);
    }
  };

  const handlePurchase = async () => {
    if (!selectedPackage) return;

    try {
      setPurchasing(true);
      const res = await fetch('/api/user/credits/topup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ packageId: selectedPackage, currency }),
      });
      
      const data = await res.json();
      
      if (data.success && data.order) {
        // Initialize Razorpay checkout
        const options = {
          key: data.key,
          amount: data.order.amount,
          currency: data.order.currency,
          name: 'Insturix Credits',
          description: data.package.name,
          order_id: data.order.id,
          handler: function (response: any) {
            console.log('Payment successful:', response);
            onSuccess?.();
            onClose();
          },
          prefill: {},
          theme: {
            color: '#f59e0b',
          },
        };
        
        // @ts-ignore - Razorpay is loaded via script
        const rzp = new window.Razorpay(options);
        rzp.open();
      }
    } catch (err) {
      console.error('Failed to create order:', err);
    } finally {
      setPurchasing(false);
    }
  };

  const formatPrice = (price: number, curr: string) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: curr,
    }).format(price);
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
      >
        <motion.div
          className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-md overflow-hidden"
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.9, opacity: 0 }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="p-6 border-b border-border flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-amber-500/20 to-orange-500/20 flex items-center justify-center">
                <Coins className="w-5 h-5 text-amber-500" />
              </div>
              <div>
                <h2 className="text-lg font-semibold">Top-up Credits</h2>
                <p className="text-sm text-muted-foreground">Credits never expire</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 rounded-lg hover:bg-muted transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Currency selector */}
          <div className="px-6 pt-4 flex gap-2">
            {['USD', 'INR', 'EUR', 'GBP'].map((curr) => (
              <button
                key={curr}
                onClick={() => setCurrency(curr)}
                className={cn(
                  "px-3 py-1.5 rounded-lg text-sm font-medium transition-colors",
                  currency === curr
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted hover:bg-muted/80"
                )}
              >
                {curr}
              </button>
            ))}
          </div>

          {/* Packages */}
          <div className="p-6 space-y-3">
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            ) : (
              packages.map((pkg) => (
                <button
                  key={pkg.id}
                  onClick={() => setSelectedPackage(pkg.id)}
                  className={cn(
                    "w-full p-4 rounded-xl border-2 transition-all text-left",
                    "flex items-center justify-between",
                    selectedPackage === pkg.id
                      ? "border-amber-500 bg-amber-500/5"
                      : "border-border hover:border-muted-foreground/30"
                  )}
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xl font-bold">{pkg.credits}</span>
                      <span className="text-sm text-muted-foreground">credits</span>
                    </div>
                    <p className="text-lg font-semibold mt-1">
                      {formatPrice(pkg.prices[currency] || pkg.prices.USD, currency)}
                    </p>
                  </div>
                  <div className={cn(
                    "w-6 h-6 rounded-full border-2 flex items-center justify-center transition-colors",
                    selectedPackage === pkg.id
                      ? "border-amber-500 bg-amber-500"
                      : "border-muted-foreground/30"
                  )}>
                    {selectedPackage === pkg.id && (
                      <Check className="w-4 h-4 text-white" />
                    )}
                  </div>
                </button>
              ))
            )}
          </div>

          {/* Purchase button */}
          <div className="p-6 pt-0">
            <button
              onClick={handlePurchase}
              disabled={!selectedPackage || purchasing}
              className={cn(
                "w-full py-3 rounded-xl font-semibold text-white transition-all",
                "bg-gradient-to-r from-amber-500 to-orange-500",
                "hover:from-amber-600 hover:to-orange-600",
                "disabled:opacity-50 disabled:cursor-not-allowed",
                "flex items-center justify-center gap-2"
              )}
            >
              {purchasing ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  <Coins className="w-5 h-5" />
                  Purchase Credits
                </>
              )}
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
