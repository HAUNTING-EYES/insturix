"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { AlertTriangle, Clock, DollarSign, Shield, X } from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";

interface TrialEligibility {
  eligible: boolean;
  daysUsed: number;
  daysRemaining: number;
  trialUsed: boolean;
  currentPlan: string;
  planStartDate: string;
  reason?: string;
}

interface PlanCancellationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentPlan: string;
  currentPlanPrice: number;
}

export function PlanCancellationDialog({
  open,
  onOpenChange,
  currentPlan,
  currentPlanPrice,
}: PlanCancellationDialogProps) {
  const [loading, setLoading] = useState(false);
  const [eligibility, setEligibility] = useState<TrialEligibility | null>(null);
  const [step, setStep] = useState<"check" | "confirm">("check");
  const queryClient = useQueryClient();
  const router = useRouter();

  const checkEligibility = async () => {
    try {
      setLoading(true);
      const response = await fetch("/api/user/plans/cancel");
      const data = await response.json();
      
      if (response.ok) {
        setEligibility(data);
        setStep("confirm");
      } else {
        toast.error(data.error || "Failed to check eligibility");
      }
    } catch (error) {
      toast.error("Failed to check trial eligibility");
      console.error("Check eligibility error:", error);
    } finally {
      setLoading(false);
    }
  };

  const cancelPlan = async () => {
    try {
      setLoading(true);
      const response = await fetch("/api/user/plans/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "cancel" }),
      });
      
      const data = await response.json();
      
      if (response.ok && data.success) {
        toast.success(data.message || "Plan cancelled successfully");
        
        // Invalidate queries to refresh UI
        queryClient.invalidateQueries({ queryKey: ["userData"] });
        queryClient.invalidateQueries({ queryKey: ["plans"] });
        router.push('/dashboard');
      } else {
        toast.error(data.error || "Failed to cancel plan");
        setLoading(false);
      }
    } catch (error) {
      toast.error("Failed to cancel plan");
      console.error("Cancel plan error:", error);
      setLoading(false);
    }
  };

  const handleClose = () => {
    setStep("check");
    setEligibility(null);
    onOpenChange(false);
  };

  if (currentPlan === "free") {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-green-500" />
              Free Plan
            </DialogTitle>
          </DialogHeader>
          <div className="py-4 text-center">
            <p className="text-muted-foreground">
              You're currently on the Free plan. There's nothing to cancel!
            </p>
            <Button onClick={() => onOpenChange(false)} className="mt-4">
              Close
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <X className="h-5 w-5 text-red-500" />
            Cancel Plan
          </DialogTitle>
          <DialogDescription>
            Cancel your {currentPlan} plan subscription
          </DialogDescription>
        </DialogHeader>

        {step === "check" && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-4"
          >
            <Card className="border-orange-500/20 bg-orange-500/5">
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="h-5 w-5 text-orange-500 mt-0.5" />
                  <div>
                    <h4 className="font-medium text-orange-200 mb-1">
                      Before you cancel
                    </h4>
                    <p className="text-sm text-orange-300/80">
                      • You may be eligible for a full refund if within 7 days of purchase
                    </p>
                    <p className="text-sm text-orange-300/80">
                      • Trial refunds are only available once per account
                    </p>
                    <p className="text-sm text-orange-300/80">
                      • You'll lose access to premium features immediately
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <div className="flex gap-2 pt-4">
              <Button
                variant="outline"
                onClick={() => onOpenChange(false)}
                className="flex-1"
              >
                Keep Plan
              </Button>
              <Button
                onClick={checkEligibility}
                disabled={loading}
                className="flex-1 bg-red-600 hover:bg-red-500"
              >
                {loading ? "Checking..." : "Continue Cancellation"}
              </Button>
            </div>
          </motion.div>
        )}

        {step === "confirm" && eligibility && (
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            className="space-y-4"
          >
            {eligibility.eligible ? (
              <Card className="border-green-500/20 bg-green-500/5">
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <DollarSign className="h-5 w-5 text-green-500 mt-0.5" />
                    <div>
                      <h4 className="font-medium text-green-200 mb-1">
                        Refund Eligible!
                      </h4>
                      <p className="text-sm text-green-300/80">
                        You're within the 7-day trial period ({eligibility.daysUsed} days used)
                      </p>
                      <p className="text-sm text-green-300/80">
                        Full refund of ${currentPlanPrice} will be processed
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <Card className="border-yellow-500/20 bg-yellow-500/5">
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <Clock className="h-5 w-5 text-yellow-500 mt-0.5" />
                    <div>
                      <h4 className="font-medium text-yellow-200 mb-1">
                        No Refund Available
                      </h4>
                      <p className="text-sm text-yellow-300/80">
                        {eligibility.trialUsed 
                          ? "You have already used your one-time trial refund"
                          : `Trial period ended (${eligibility.daysUsed} days used)`
                        }
                      </p>
                      <p className="text-sm text-yellow-300/80">
                        Plan will remain active until current billing period ends
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            <div className="flex gap-2 pt-4">
              <Button
                variant="outline"
                onClick={() => setStep("check")}
                className="flex-1"
              >
                Back
              </Button>
              <Button
                onClick={cancelPlan}
                disabled={loading}
                className="flex-1 bg-red-600 hover:bg-red-500"
              >
                {loading ? "Cancelling..." : "Confirm Cancellation"}
              </Button>
            </div>
          </motion.div>
        )}
      </DialogContent>
    </Dialog>
  );
}