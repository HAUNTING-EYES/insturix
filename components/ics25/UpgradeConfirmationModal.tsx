"use client";

import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { AlertTriangle, ArrowRight, Check, AlertCircle, CheckCircle2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";

type Tier = "bronze" | "silver" | "gold" | "creators";

const TIER_LABELS: Record<Tier, string> = {
  bronze: "Bronze",
  silver: "Silver",
  gold: "Gold",
  creators: "Creators",
};

const TIER_COLORS: Record<Tier, { 
  gradient: string; 
  text: string; 
  icon: string;
}> = {
  bronze: {
    gradient: "from-amber-600 via-amber-500 to-amber-700",
    text: "text-amber-500",
    icon: "text-amber-500"
  },
  silver: {
    gradient: "from-gray-300 via-gray-100 to-gray-400",
    text: "text-gray-300",
    icon: "text-gray-300"
  },
  gold: {
    gradient: "from-yellow-400 via-yellow-300 to-yellow-500",
    text: "text-yellow-400",
    icon: "text-yellow-400"
  },
  creators: {
    gradient: "from-red-500 via-red-400 to-red-600",
    text: "text-red-400",
    icon: "text-red-400"
  }
};

const TIER_BENEFITS: Record<Tier, string[]> = {
  bronze: ["Access to panel talks", "Access to speaker sessions", "Audience Access to Creator Awards"],
  silver: ["Everything in Bronze", "Participate in Reel making showdown", "Speed Edits", "Access to quiet rooms and Gaming Zones", "Talent Showdown"],
  gold: ["Everything in Silver", "Networking lounge", "Lunch both days", "Exclusive merch", "1 yr Insturix Pro Subscription"],
  creators: ["Everything in Gold", "Priority Access", "Brand Shoutout", "Featuring on Banner"],
};

interface UpgradeConfirmationModalProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  currentTier: Tier;
  targetTier: Tier;
  currentPrice: number;
  targetPrice: number;
  upgrading: boolean;
  // Optional: start modal on step 1 or 2 (1 = review, 2 = final confirmation)
  startStep?: 1 | 2;
}

export default function UpgradeConfirmationModal({
  open,
  onClose,
  onConfirm,
  currentTier,
  targetTier,
  currentPrice,
  targetPrice,
  upgrading,
  startStep = 1,
}: UpgradeConfirmationModalProps) {
  // Always default to step 1; only jump to step 2 when the modal opens and
  // startStep explicitly requests it. This avoids showing step 2 on initial
  // mount before the modal is opened.
  const [confirmationStep, setConfirmationStep] = useState<1 | 2 | 3>(1);
  const [succeeded, setSucceeded] = useState(false);

  useEffect(() => {
    if (open && startStep === 2) {
      setConfirmationStep(2);
    } else if (!open) {
      // reset when modal is closed
      setConfirmationStep(1);
      setSucceeded(false);
    }
  }, [open, startStep]);

  const priceDiff = targetPrice - currentPrice;
  const isRefund = priceDiff < 0;
  const amount = Math.abs(priceDiff);

  const handleClose = () => {
    setConfirmationStep(1);
    setSucceeded(false);
    onClose();
  };

  const handleFirstConfirm = () => {
    setConfirmationStep(2);
  };

  const handleFinalConfirm = async () => {
    try {
      await onConfirm();
      // On success, show step 3 (success screen)
      setSucceeded(true);
      setConfirmationStep(3);
    } catch (error) {
      // Error is handled in parent; modal stays on step 2
      console.error("Upgrade failed:", error);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-lg bg-transparent border-0 text-white p-0 max-h-[85vh]">
          <div className="rounded-3xl overflow-hidden p-[1px] bg-gradient-to-br from-white/10 via-white/5 to-white/10" style={{maxHeight: '85vh'}}>
            <div className="relative rounded-[22px] bg-black/60 backdrop-blur-xl p-6 border border-white/5 overflow-y-auto pr-2" style={{maxHeight: '82vh'}}>
            {confirmationStep === 1 ? (
          <>
            <DialogHeader>
              <DialogTitle className="text-2xl text-center font-bold bg-gradient-to-r from-white to-white/80 bg-clip-text text-transparent">
                Upgrade Your Pass
              </DialogTitle>
              <DialogDescription className="text-center text-white/60">
                Review the details before proceeding
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              {/* Current → Target */}
              <div className="flex items-center justify-center gap-8">
                      {/* Current Pass */}
                      <div className="text-center flex-1">
                        <div className="text-xs text-white/50 mb-3 uppercase tracking-wider font-medium">Current</div>
                        <div className={`font-bold text-xl bg-gradient-to-r ${TIER_COLORS[currentTier].gradient} bg-clip-text text-transparent mb-2`} style={{ textShadow: `0 0 8px ${currentTier === 'bronze' ? 'rgba(217,119,6,0.8)' : currentTier === 'silver' ? 'rgba(229,231,235,0.8)' : currentTier === 'gold' ? 'rgba(250,204,21,0.8)' : 'rgba(239,68,68,0.8)'}` }}>
                          {TIER_LABELS[currentTier]}
                        </div>
                        <div className="text-sm text-white/70 font-medium">₹{currentPrice.toLocaleString()}</div>
                      </div>

                      {/* Arrow */}
                      <div className="flex flex-col items-center">
                        <div className="relative">
                          <ArrowRight className={`h-8 w-8 ${TIER_COLORS[targetTier].icon} drop-shadow-lg`} />
                          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent blur-sm -z-10" />
                        </div>
                        <div className="text-xs text-white/60 mt-2 font-medium">Upgrade</div>
                      </div>

                      {/* Target Pass */}
                      <div className="text-center flex-1">
                        <div className="text-xs text-white/50 mb-3 uppercase tracking-wider font-medium">Upgrading To</div>
                        <div className={`font-bold text-xl bg-gradient-to-r ${TIER_COLORS[targetTier].gradient} bg-clip-text text-transparent mb-2`} style={{ textShadow: `0 0 8px ${targetTier === 'bronze' ? 'rgba(217,119,6,0.8)' : targetTier === 'silver' ? 'rgba(229,231,235,0.8)' : targetTier === 'gold' ? 'rgba(250,204,21,0.8)' : 'rgba(239,68,68,0.8)'}` }}>
                          {TIER_LABELS[targetTier]}
                        </div>
                        <div className="text-sm text-white/70 font-medium">₹{targetPrice.toLocaleString()}</div>
                      </div>
                    </div>

              {/* Price Difference */}
              <div className="p-[1px] rounded-[22px] bg-gradient-to-br from-white/12 via-white/6 to-transparent relative group">
                <div className="absolute inset-0 rounded-[22px] bg-gradient-to-br from-white/6 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />
                <div className="relative bg-black/55 backdrop-blur-xl rounded-[22px] p-4 border border-white/5">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-white/80">
                      {isRefund ? "Refund Amount" : "Additional Payment"}
                    </span>
                    <span className="text-xl font-bold text-white">
                      {isRefund ? '-' : '+'}₹{amount.toLocaleString()}
                    </span>
                  </div>
                </div>
              </div>

              {/* Refund Notice */}
              {isRefund && (
                <div className="p-[1px] rounded-[22px] bg-gradient-to-br from-amber-500/30 via-amber-600/20 to-transparent relative group">
                  <div className="absolute inset-0 rounded-[22px] bg-gradient-to-br from-white/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />
                  <div className="relative bg-black/55 backdrop-blur-xl rounded-[22px] p-4 border border-white/5">
                    <div className="flex items-start gap-3">
                      <AlertCircle className="h-5 w-5 text-amber-400 mt-0.5 flex-shrink-0" />
                      <div className="flex-1">
                        <p className="text-sm font-medium text-amber-300 mb-1">Refund Processing Time</p>
                        <p className="text-xs text-white/70">
                          The refund of ₹{amount.toLocaleString()} will be credited to your original payment method within 3-5 business days.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Important Notice */}
              <div className="p-[1px] rounded-[22px] bg-gradient-to-br from-red-500/30 via-red-600/20 to-transparent relative group">
                <div className="absolute inset-0 rounded-[22px] bg-gradient-to-br from-white/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />
                <div className="relative bg-black/55 backdrop-blur-xl rounded-[22px] p-4 border border-white/5">
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="h-5 w-5 text-red-400 mt-0.5 flex-shrink-0" />
                    <div className="flex-1">
                      <p className="text-sm font-medium text-red-300 mb-1">Important</p>
                      <p className="text-xs text-white/70">
                        This action cannot be reversed. Once you upgrade, you cannot downgrade back to {TIER_LABELS[currentTier]}.
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Benefits Summary */}
              <div className="p-[1px] rounded-[22px] bg-gradient-to-br from-white/20 via-white/10 to-transparent relative group">
                <div className="absolute inset-0 rounded-[22px] bg-gradient-to-br from-white/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />
                <div className="relative bg-black/55 backdrop-blur-xl rounded-[22px] p-4 border border-white/5">
                  <p className="text-sm font-medium text-white mb-2">You'll get access to:</p>
                  <div className="space-y-1">
                    {TIER_BENEFITS[targetTier].map((benefit, index) => (
                      <div key={index} className="flex items-center gap-2 text-xs text-white/80">
                        <Check className="h-3 w-3 text-emerald-400" />
                        <span>{benefit}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <DialogFooter className="flex-col sm:flex-row gap-3 items-center sm:justify-between">
              <Button
                variant="outline"
                onClick={handleClose}
                className="w-full sm:w-auto px-6 py-3 border-white/20 bg-transparent text-white hover:bg-white/5 rounded-xl font-semibold transition-all duration-200"
              >
                Cancel
              </Button>
              <div className="w-full sm:w-auto flex justify-end">
                {startStep === 1 && (
                  <Button
                    onClick={handleFirstConfirm}
                    className="group px-8 py-3 bg-white text-black font-semibold rounded-xl shadow-[0_12px_40px_rgba(255,255,255,0.08)] hover:shadow-[0_16px_50px_rgba(255,255,255,0.12)] transition-all duration-300 flex items-center justify-center hover:scale-105 active:scale-95"
                  >
                    Upgrade Now
                    <ArrowRight className="h-4 w-4 ml-2 text-black transition-transform duration-300 group-hover:translate-x-1" />
                  </Button>
                )}
              </div>
            </DialogFooter>
          </>
        ) : confirmationStep === 2 ? (
          <>
            <DialogHeader>
              <DialogTitle className="text-2xl text-center font-bold bg-gradient-to-r from-white to-white/80 bg-clip-text text-transparent">
                Are You Absolutely Sure?
              </DialogTitle>
              <DialogDescription className="text-center text-white/60">
                This is your final confirmation
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              {/* Irreversible Warning */}
              <div className="p-[1px] rounded-[22px] bg-gradient-to-br from-red-500/20 via-red-600/10 to-transparent relative group">
                <div className="absolute inset-0 rounded-[22px] bg-gradient-to-br from-red-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />
                <div className="relative bg-black/60 backdrop-blur-xl rounded-[22px] p-5 border border-red-500/10">
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="h-5 w-5 text-red-400 mt-0.5 flex-shrink-0" />
                    <div className="flex-1">
                      <p className="text-sm font-semibold text-red-300 mb-2">⚠️ This action is IRREVERSIBLE</p>
                      <div className="space-y-2 text-xs text-white/80">
                        <div className="flex items-start gap-2">
                          <span className="text-red-400 mt-0.5">•</span>
                          <span>You <strong className="text-red-200">cannot</strong> downgrade back to <span className={`font-semibold ${TIER_COLORS[currentTier].text}`}>{TIER_LABELS[currentTier]}</span></span>
                        </div>
                        <div className="flex items-start gap-2">
                          <span className="text-red-400 mt-0.5">•</span>
                          <span>You <strong className="text-red-200">cannot</strong> request a refund after upgrading</span>
                        </div>
                        <div className="flex items-start gap-2">
                          <span className="text-red-400 mt-0.5">•</span>
                          <span>Your decision is <strong className="text-red-200">final</strong> and cannot be changed</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Confirmation Checklist */}
              <div className="p-[1px] rounded-[22px] bg-gradient-to-br from-emerald-500/20 via-emerald-600/10 to-transparent relative group">
                <div className="absolute inset-0 rounded-[22px] bg-gradient-to-br from-emerald-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />
                <div className="relative bg-black/60 backdrop-blur-xl rounded-[22px] p-5 border border-emerald-500/10">
                  <p className="text-sm font-semibold text-emerald-300 mb-3">✓ By proceeding, you confirm:</p>
                  <div className="space-y-2.5 text-xs text-white/80">
                    <div className="flex items-start gap-2">
                      <Check className="h-4 w-4 text-emerald-400 mt-0.5 flex-shrink-0" />
                      <span>Understand this action cannot be undone</span>
                    </div>
                    <div className="flex items-start gap-2">
                      <Check className="h-4 w-4 text-emerald-400 mt-0.5 flex-shrink-0" />
                      <span>Agree to {isRefund ? 'receive a refund of' : 'pay'} <strong className="text-white">₹{amount.toLocaleString()}</strong></span>
                    </div>
                    <div className="flex items-start gap-2">
                      <Check className="h-4 w-4 text-emerald-400 mt-0.5 flex-shrink-0" />
                      <span>Want to proceed with upgrading to <span className={`font-semibold ${TIER_COLORS[targetTier].text}`}>{TIER_LABELS[targetTier]}</span></span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <DialogFooter className="flex-col sm:flex-row gap-3 items-center sm:justify-between">
              <Button
                variant="outline"
                onClick={() => setConfirmationStep(1)}
                disabled={upgrading}
                className="w-full sm:w-auto px-6 py-3 border-white/20 bg-transparent text-white hover:bg-white/5 rounded-xl font-semibold transition-all duration-200"
              >
                Go Back
              </Button>
              <div className="w-full sm:w-auto flex justify-end">
                <Button
                  onClick={handleFinalConfirm}
                  disabled={upgrading}
                  className={`${targetTier === 'creators' && startStep === 2 ? 'px-8 py-3 bg-emerald-500 hover:bg-emerald-600 text-white' : 'px-8 py-3 bg-white text-black'} font-semibold rounded-xl shadow-[0_12px_40px_rgba(255,255,255,0.08)] hover:shadow-[0_16px_50px_rgba(255,255,255,0.12)] transition-all duration-300`}
                >
                  {upgrading ? "Processing..." : targetTier === 'creators' && startStep === 2 ? 'Yes, Proceed' : `Upgrade to ${TIER_LABELS[targetTier]}`}
                </Button>
              </div>
            </DialogFooter>
          </>
        ) : (
          <>
            {/* Step 3: Success Screen */}
            <DialogHeader>
              <div className="flex justify-center mb-4">
                <CheckCircle2 className="h-16 w-16 text-emerald-400" />
              </div>
              <DialogTitle className="text-2xl text-center font-bold bg-gradient-to-r from-emerald-300 to-emerald-400 bg-clip-text text-transparent">
                Registration Successful!
              </DialogTitle>
              <DialogDescription className="text-center text-white/60">
                Your upgrade has been completed
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              {/* Success Message */}
              <div className="p-[1px] rounded-[22px] bg-gradient-to-br from-emerald-500/20 via-emerald-600/10 to-transparent relative group">
                <div className="absolute inset-0 rounded-[22px] bg-gradient-to-br from-emerald-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />
                <div className="relative bg-black/60 backdrop-blur-xl rounded-[22px] p-5 border border-emerald-500/10">
                  <div className="flex items-start gap-3">
                    <CheckCircle2 className="h-5 w-5 text-emerald-400 mt-0.5 flex-shrink-0" />
                    <div className="flex-1">
                      <p className="text-sm font-semibold text-emerald-300 mb-2">✓ You're now a {TIER_LABELS[targetTier]} member</p>
                      <p className="text-xs text-white/80">
                        Welcome to the {TIER_LABELS[targetTier]} tier! You now have access to all the exclusive benefits.
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Refund Status (if applicable) */}
              {isRefund && (
                <div className="p-[1px] rounded-[22px] bg-gradient-to-br from-blue-500/20 via-blue-600/10 to-transparent relative group">
                  <div className="absolute inset-0 rounded-[22px] bg-gradient-to-br from-blue-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />
                  <div className="relative bg-black/60 backdrop-blur-xl rounded-[22px] p-5 border border-blue-500/10">
                    <div className="flex items-start gap-3">
                      <Check className="h-5 w-5 text-blue-400 mt-0.5 flex-shrink-0" />
                      <div className="flex-1">
                        <p className="text-sm font-semibold text-blue-300 mb-2">✓ Refund Has Been Processed</p>
                        <p className="text-xs text-white/80">
                          Your refund of <strong>₹{amount.toLocaleString()}</strong> will be credited to your original payment method within <strong>3-5 business days</strong>.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Next Steps */}
              <div className="p-[1px] rounded-[22px] bg-gradient-to-br from-white/20 via-white/10 to-transparent relative group">
                <div className="absolute inset-0 rounded-[22px] bg-gradient-to-br from-white/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />
                <div className="relative bg-black/60 backdrop-blur-xl rounded-[22px] p-5 border border-white/5">
                  <p className="text-sm font-semibold text-white mb-3">📋 Next Steps:</p>
                  <div className="space-y-2.5 text-xs text-white/80">
                    <div className="flex items-start gap-2">
                      <Check className="h-4 w-4 text-emerald-400 mt-0.5 flex-shrink-0" />
                      <span>Check your email for confirmation details</span>
                    </div>
                    <div className="flex items-start gap-2">
                      <Check className="h-4 w-4 text-emerald-400 mt-0.5 flex-shrink-0" />
                      <span>Visit your dashboard to see your new benefits</span>
                    </div>
                    <div className="flex items-start gap-2">
                      <Check className="h-4 w-4 text-emerald-400 mt-0.5 flex-shrink-0" />
                      <span>Contact support if you have any questions</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <DialogFooter className="flex-col sm:flex-row gap-3 items-center sm:justify-center">
              <Button
                onClick={handleClose}
                className="w-full sm:w-auto px-8 py-3 bg-emerald-500 hover:bg-emerald-600 text-white font-semibold rounded-xl shadow-[0_12px_40px_rgba(16,185,129,0.3)] transition-all duration-300"
              >
                Close
              </Button>
            </DialogFooter>
          </>
        )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
