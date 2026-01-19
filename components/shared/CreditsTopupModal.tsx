"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Check, Loader2, AlertCircle, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useCredits } from "@/hooks/useCredits";
import { useToast } from "@/hooks/use-toast";

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
  const [error, setError] = useState<string | null>(null);
  const [scriptLoaded, setScriptLoaded] = useState(false);
  
  const { invalidateCredits } = useCredits();
  const { toast } = useToast();

  // Load Razorpay script
  useEffect(() => {
    if (typeof window === 'undefined') return;
    
    // Check if already loaded
    if ((window as any).Razorpay) {
      setScriptLoaded(true);
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.async = true;
    script.onload = () => setScriptLoaded(true);
    script.onerror = () => {
      setError('Failed to load payment system. Please refresh the page.');
    };
    document.body.appendChild(script);

    return () => {
      // Cleanup if needed
    };
  }, []);

  // Fetch packages when modal opens
  useEffect(() => {
    if (isOpen) {
      fetchPackages();
      setError(null);
    }
  }, [isOpen]);

  const fetchPackages = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch('/api/user/credits/topup');
      
      if (!res.ok) {
        throw new Error('Failed to fetch credit packages');
      }
      
      const data = await res.json();
      if (data.success) {
        setPackages(data.packages);
        if (data.packages.length > 0) {
          setSelectedPackage(data.packages[1]?.id || data.packages[0]?.id);
        }
      } else {
        throw new Error(data.error || 'Failed to load packages');
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load packages';
      setError(message);
      toast({
        title: "Error",
        description: message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handlePurchase = useCallback(async () => {
    if (!selectedPackage) return;

    // Check if Razorpay is loaded
    if (!scriptLoaded || !(window as any).Razorpay) {
      setError('Payment system is still loading. Please wait a moment.');
      return;
    }

    setError(null);
    setPurchasing(true);

    try {
      const res = await fetch('/api/user/credits/topup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ packageId: selectedPackage, currency }),
      });
      
      const data = await res.json();
      
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to create payment order');
      }
      
      if (data.order) {
        const selectedPkg = packages.find(p => p.id === selectedPackage);
        
        // Initialize Razorpay checkout with full options
        const options = {
          key: data.key,
          amount: data.order.amount,
          currency: data.order.currency,
          name: 'Insturix Credits',
          description: data.package.name,
          order_id: data.order.id,
          handler: async function (response: any) {
            // Payment successful - now verify and add credits
            console.log('Payment successful, verifying:', response);
            
            try {
              // Call verify endpoint to add credits directly
              const verifyRes = await fetch('/api/user/credits/verify', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  razorpay_order_id: response.razorpay_order_id,
                  razorpay_payment_id: response.razorpay_payment_id,
                  razorpay_signature: response.razorpay_signature,
                  packageId: selectedPackage,
                }),
              });
              
              const verifyData = await verifyRes.json();
              
              if (verifyRes.ok && verifyData.success) {
                // Credits added successfully
                toast({
                  title: "Payment Successful! 🎉",
                  description: `${verifyData.creditsAdded || selectedPkg?.credits || data.package.credits} credits have been added to your account.`,
                });
                
                // Invalidate credits query to refresh balance
                invalidateCredits();
                
                // Call success callback
                onSuccess?.();
                
                // Close modal
                onClose();
              } else {
                // Verification failed but payment went through
                // This means webhook should eventually process it
                console.warn('Verify failed:', verifyData);
                toast({
                  title: "Payment Received",
                  description: "Your payment was successful. Credits will be added shortly.",
                });
                onSuccess?.();
                onClose();
              }
            } catch (verifyError) {
              console.error('Verify error:', verifyError);
              // Payment succeeded but verification call failed
              // Webhook should handle it
              toast({
                title: "Payment Received",
                description: "Your payment was successful. Credits will be added shortly.",
              });
              onSuccess?.();
              onClose();
            }
          },
          prefill: {},
          theme: {
            color: '#18181b',
          },
          modal: {
            ondismiss: function() {
              // User closed the payment modal
              setPurchasing(false);
              toast({
                title: "Payment Cancelled",
                description: "You cancelled the payment. No charges were made.",
                variant: "default",
              });
            },
            confirm_close: true,
            escape: true,
          },
        };

        // Add payment failure handler
        const rzp = new (window as any).Razorpay(options);
        
        rzp.on('payment.failed', function (response: any) {
          console.error('Payment failed:', response.error);
          setPurchasing(false);
          
          const errorMessage = response.error?.description || 'Payment failed. Please try again.';
          setError(errorMessage);
          
          toast({
            title: "Payment Failed",
            description: errorMessage,
            variant: "destructive",
          });
        });
        
        rzp.open();
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to process payment';
      setError(message);
      setPurchasing(false);
      
      toast({
        title: "Error",
        description: message,
        variant: "destructive",
      });
    }
  }, [selectedPackage, scriptLoaded, currency, packages, toast, invalidateCredits, onSuccess, onClose]);

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
              disabled={purchasing}
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Error Banner */}
          <AnimatePresence>
            {error && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="px-5 pt-4"
              >
                <div className="flex items-start gap-3 p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive">
                  <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
                  <p className="text-sm">{error}</p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Currency selector */}
          <div className="px-5 pt-4 flex gap-2">
            {['USD', 'INR', 'EUR', 'GBP'].map((curr) => (
              <button
                key={curr}
                onClick={() => setCurrency(curr)}
                disabled={purchasing}
                className={cn(
                  "px-3 py-1.5 rounded-md text-sm font-medium transition-colors",
                  currency === curr
                    ? "bg-foreground text-background"
                    : "bg-muted hover:bg-muted/80 text-muted-foreground",
                  purchasing && "opacity-50 cursor-not-allowed"
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
                  disabled={purchasing}
                  className={cn(
                    "w-full p-4 rounded-lg border transition-all text-left",
                    "flex items-center justify-between",
                    selectedPackage === pkg.id
                      ? "border-foreground/50 bg-muted/50"
                      : "border-border hover:border-border/80",
                    purchasing && "opacity-50 cursor-not-allowed"
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
              disabled={!selectedPackage || purchasing || !scriptLoaded}
              className={cn(
                "w-full py-3 rounded-lg font-medium transition-colors",
                "bg-foreground text-background",
                "hover:bg-foreground/90",
                "disabled:opacity-50 disabled:cursor-not-allowed",
                "flex items-center justify-center gap-2"
              )}
            >
              {!scriptLoaded ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Loading...
                </>
              ) : purchasing ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Processing...
                </>
              ) : (
                'Purchase Credits'
              )}
            </button>
            
            {/* Security note */}
            <p className="text-xs text-muted-foreground text-center mt-3">
              Payments are processed securely by Razorpay
            </p>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
