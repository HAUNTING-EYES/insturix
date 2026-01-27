"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Check, Loader2, AlertCircle, CheckCircle2, Globe, Sparkles, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { useCredits } from "@/hooks/useCredits";
import { useToast } from "@/hooks/use-toast";

interface CreditPackage {
  id: string;
  name: string;
  credits: number;
  prices: Record<string, number>;
}

// Add Plan type definition locally or import if possible, but for modal we can unify
import { SUBSCRIPTION_PLANS, SubscriptionPlan } from "@/lib/config/creditCosts";

interface TopupModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  initialPackageId?: string | null;
}

export function BillingPaymentModal({ isOpen, onClose, onSuccess, initialPackageId }: TopupModalProps) {
  const [packages, setPackages] = useState<CreditPackage[]>([]);
  // We'll treat subscription plans as a separate state or just find it from config
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  
  // Combine logic: check if ID is a plan first, else check packages
  const isSubscription = initialPackageId && SUBSCRIPTION_PLANS.some(p => p.id === initialPackageId);
  const [selectedPackage, setSelectedPackage] = useState<string | null>(initialPackageId || null);
  const [loading, setLoading] = useState(true);
  const [purchasing, setPurchasing] = useState(false);
  const [currency] = useState('USD');
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
        
        // If it's a subscription, we don't need to auto-select a credit package unless we want to switch
        if (initialPackageId && SUBSCRIPTION_PLANS.some(p => p.id === initialPackageId)) {
             // It's a plan, do nothing for packages selection yet
             setSelectedPackage(initialPackageId);
        } else if (!selectedPackage && data.packages.length > 0) {
          setSelectedPackage(data.packages[1]?.id || data.packages[0]?.id);
        } else if (initialPackageId) {
          setSelectedPackage(initialPackageId);
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
      const isPlan = SUBSCRIPTION_PLANS.some(p => p.id === selectedPackage);
      
      let res, data;
      
      if (isPlan) {
        // Handle native subscription
        res = await fetch('/api/create-subscription', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            planType: selectedPackage, 
            currency: 'USD', 
            billingCycle: 'monthly' 
          }),
        });
      } else {
        // Handle common top-up
        res = await fetch('/api/user/credits/topup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ packageId: selectedPackage, currency }),
        });
      }
      
      data = await res.json();
      
      if (!res.ok) {
        throw new Error(data.error || 'Failed to initiate payment');
      }
      
      if (data.order || data.subscriptionId) {
        const selectedPkg = packages.find(p => p.id === selectedPackage) || SUBSCRIPTION_PLANS.find(p => p.id === selectedPackage);
        
        // Initialize Razorpay checkout with full options
        const options: any = {
          key: data.razorpayKey || data.key,
          name: isPlan ? `Insturix ${selectedPkg?.name} Plan` : 'Insturix Credits',
          description: isPlan ? `Monthly Subscription` : selectedPkg?.name,
          prefill: {},
          theme: { color: '#18181b' },
          handler: async function (response: any) {
            // Payment successful - now verify
            console.log('Payment successful, verifying:', response);
            
            try {
              const verifyUrl = isPlan ? '/api/user/plans/verify' : '/api/user/credits/verify';
              
              // Call verify endpoint
              const verifyRes = await fetch(verifyUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  razorpay_order_id: response.razorpay_order_id,
                  razorpay_payment_id: response.razorpay_payment_id,
                  razorpay_signature: response.razorpay_signature,
                  razorpay_subscription_id: response.razorpay_subscription_id,
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
          modal: {
            ondismiss: function() {
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

        if (data.subscriptionId) {
          options.subscription_id = data.subscriptionId;
        } else if (data.order) {
          options.order_id = data.order.id;
          options.amount = data.order.amount;
          options.currency = data.order.currency;
        }

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
          {/* Modal Header */}
          <div className="flex items-center gap-4 px-5 pt-8 pb-4">
            <div className="w-10 h-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-amber-500/80" />
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-xl font-bold text-white tracking-tight">
                {isSubscription ? 'Upgrade Plan' : 'Refuel Account'}
              </h2>
              <p className="text-[10px] text-white/20 font-bold uppercase tracking-widest mt-0.5">
                {isSubscription ? 'Monthly Benefits • Higher Priority' : 'Instant Activation • No Expiry'}
              </p>
            </div>
            <button
              onClick={onClose}
              className="p-2 rounded-lg hover:bg-white/5 transition-colors"
              disabled={purchasing}
            >
              <X className="w-4 h-4 text-white/20" />
            </button>
          </div>

          {/* Plan Info for Subscriptions */}
          {isSubscription && !loading && (
            <div className="px-5 py-4">
              {(() => {
                const plan = SUBSCRIPTION_PLANS.find(p => p.id === selectedPackage);
                if (!plan) return null;
                return (
                  <div className="p-4 rounded-xl bg-amber-500/5 border border-amber-500/10 space-y-3">
                    <div className="flex justify-between items-start">
                      <div>
                        <h3 className="font-bold text-white text-lg">{plan.name} Plan</h3>
                        <p className="text-sm text-white/60">{plan.credits.toLocaleString()} credits / month</p>
                      </div>
                      <div className="text-right">
                        <div className="text-xl font-black text-amber-500">${plan.price}</div>
                        <div className="text-[10px] text-white/20 font-bold uppercase tracking-wider">USD / MO</div>
                      </div>
                    </div>
                    <div className="space-y-2 pt-2 border-t border-white/5">
                      {plan.features.slice(0, 3).map((feature, i) => (
                        <div key={i} className="flex items-center gap-2 text-xs text-white/40">
                          <CheckCircle2 className="w-3 h-3 text-amber-500/50" />
                          {feature}
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}
            </div>
          )}

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

          {/* Checkout Info */}
          <div className="px-5 pt-4">
            <div className="flex items-center gap-2 text-[10px] font-bold text-white/20 uppercase tracking-[0.15em]">
              <Globe className="w-3 h-3" />
              Secure Checkout • USD
            </div>
          </div>

          {/* Packages - Only show if not a direct subscription upgrade or if we want to allow switching */}
          {!isSubscription && (
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
          )}

          {/* Purchase button */}
          <div className="p-5 pt-0">
            <button
              onClick={handlePurchase}
              disabled={!selectedPackage || purchasing || !scriptLoaded}
              className={cn(
                "w-full py-4 rounded-xl font-bold transition-all duration-300",
                isSubscription 
                  ? "bg-amber-500 text-black hover:bg-amber-400 shadow-[0_0_20px_rgba(245,158,11,0.2)]"
                  : "bg-white text-black hover:bg-white/90 shadow-xl",
                "disabled:opacity-50 disabled:cursor-not-allowed",
                "flex items-center justify-center gap-2 text-base"
              )}
            >
              {!scriptLoaded ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Initialising...
                </>
              ) : purchasing ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Processing...
                </>
              ) : (
                isSubscription ? 'Activate Plan' : 'Purchase Credits'
              )}
            </button>
            
            {/* Security note */}
            <p className="text-[10px] text-white/20 text-center mt-4 font-medium uppercase tracking-widest">
              Secure Global Payments via Razorpay
            </p>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
