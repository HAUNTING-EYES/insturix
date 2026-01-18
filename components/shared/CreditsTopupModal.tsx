"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Check, Loader2 } from "lucide-react";
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
            color: '#18181b',
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
          className="bg-card border border-border rounded-xl shadow-2xl w-full max-w-md overflow-hidden"
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.95, opacity: 0 }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="p-5 border-b border-border flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold">Add Credits</h2>
              <p className="text-sm text-muted-foreground">Credits never expire</p>
            </div>
            <button
              onClick={onClose}
              className="p-2 rounded-lg hover:bg-muted transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Currency selector */}
          <div className="px-5 pt-4 flex gap-2">
            {['USD', 'INR', 'EUR', 'GBP'].map((curr) => (
              <button
                key={curr}
                onClick={() => setCurrency(curr)}
                className={cn(
                  "px-3 py-1.5 rounded-md text-sm font-medium transition-colors",
                  currency === curr
                    ? "bg-foreground text-background"
                    : "bg-muted hover:bg-muted/80 text-muted-foreground"
                )}
              >
                {curr}
              </button>
            ))}
          </div>

          {/* Packages */}
          <div className="p-5 space-y-3">
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
              </div>
            ) : (
              packages.map((pkg) => (
                <button
                  key={pkg.id}
                  onClick={() => setSelectedPackage(pkg.id)}
                  className={cn(
                    "w-full p-4 rounded-lg border transition-all text-left",
                    "flex items-center justify-between",
                    selectedPackage === pkg.id
                      ? "border-foreground/50 bg-muted/50"
                      : "border-border hover:border-border/80"
                  )}
                >
                  <div>
                    <div className="flex items-baseline gap-2">
                      <span className="text-xl font-semibold tabular-nums">{pkg.credits}</span>
                      <span className="text-sm text-muted-foreground">credits</span>
                    </div>
                    <p className="text-base font-medium mt-0.5 text-muted-foreground">
                      {formatPrice(pkg.prices[currency] || pkg.prices.USD, currency)}
                    </p>
                  </div>
                  <div className={cn(
                    "w-5 h-5 rounded-full border flex items-center justify-center transition-colors",
                    selectedPackage === pkg.id
                      ? "border-foreground bg-foreground"
                      : "border-muted-foreground/30"
                  )}>
                    {selectedPackage === pkg.id && (
                      <Check className="w-3 h-3 text-background" />
                    )}
                  </div>
                </button>
              ))
            )}
          </div>

          {/* Purchase button */}
          <div className="p-5 pt-0">
            <button
              onClick={handlePurchase}
              disabled={!selectedPackage || purchasing}
              className={cn(
                "w-full py-3 rounded-lg font-medium transition-colors",
                "bg-foreground text-background",
                "hover:bg-foreground/90",
                "disabled:opacity-50 disabled:cursor-not-allowed",
                "flex items-center justify-center gap-2"
              )}
            >
              {purchasing ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Processing...
                </>
              ) : (
                'Purchase Credits'
              )}
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
