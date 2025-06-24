import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogClose } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { IUserPlan } from "@/types/userTypes";
import { AnimatePresence, motion } from "framer-motion";
import { format } from "date-fns";
import { useState } from "react";
import { UserCog, X, Calendar } from "lucide-react";
import { useRouter } from "next/navigation";
import { PlanCancellationDialog } from "@/components/PlanCancellationDialog";

interface ManagePlanDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  plans: IUserPlan[];
  currentPlan: IUserPlan;
}

function getCurrencySymbol(currency: string) {
  switch (currency?.toUpperCase()) {
    case "INR":
      return "₹";
    case "USD":
      return "$";
    case "EUR":
      return "€";
    case "GBP":
      return "£";
    default:
      return currency;
  }
}

export default function ManagePlanDialog({ open, onOpenChange, plans, currentPlan }: ManagePlanDialogProps) {
  const [showCancel, setShowCancel] = useState(false);
  const isCancelable = currentPlan && currentPlan.status === "active" && currentPlan.name !== "free";
  const isFree = currentPlan && currentPlan.name === "free";
  const router = useRouter();

  // Sort plans: current first, then by endDate descending
  const sortedPlans = [
    ...(currentPlan ? [currentPlan] : []),
    ...plans
      .filter(p => !currentPlan || p.planId !== currentPlan.planId || p.startDate !== currentPlan.startDate)
      .sort((a, b) => (b.endDate ? new Date(b.endDate).getTime() : 0) - (a.endDate ? new Date(a.endDate).getTime() : 0)),
  ];

  function planStatusBadge(status: string) {
    if (status === "active") return <Badge className="bg-green-200/60 border border-green-400/40 text-green-700">Active</Badge>;
    if (status === "expired") return <Badge className="bg-zinc-300/60 border border-zinc-400/40 text-zinc-700">Expired</Badge>;
    if (status === "canceled") return <Badge className="bg-red-200/60 border border-red-400/40 text-red-700">Canceled</Badge>;
    return null;
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl w-full rounded-2xl bg-zinc-900 border border-white/10 p-0 overflow-hidden shadow-2xl max-h-[90vh] flex flex-col justify-center">
        <DialogHeader className="p-6 pb-2 border-b border-white/10 bg-zinc-900">
          <div className="flex items-center justify-between">
            <DialogTitle className="text-lg font-bold flex items-center gap-2 text-white">
              <UserCog className="w-5 h-5 text-indigo-400" /> Manage Plan
            </DialogTitle>
          </div>
          <DialogDescription className="text-zinc-400 mt-1 text-sm">
            View your current and previous subscription plans.
          </DialogDescription>
        </DialogHeader>
        <div className="p-8 space-y-6 overflow-y-auto">
          <AnimatePresence>
            {sortedPlans.map((plan, idx) => (
              <motion.div
                key={plan.planId + String(plan.startDate) + String(plan.endDate) + '-' + idx}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 10 }}
                transition={{ duration: 0.2, delay: idx * 0.05 }}
                className={`rounded-xl px-6 py-4 flex flex-col gap-1 border border-white/5 bg-zinc-800/60 ${idx === 0 ? "ring-2 ring-indigo-500/30" : ""}`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-white capitalize text-base">
                      {plan.name}
                    </span>
                    {planStatusBadge(plan.status)}
                  </div>
                  <span className="flex items-center gap-1 text-indigo-300 font-medium">
                    <span className="text-lg">{getCurrencySymbol(plan.currency)}</span>
                    {plan.price} {plan.currency !== "USD" && plan.currency !== "INR" ? plan.currency : null}
                  </span>
                </div>
                <div className="flex items-center gap-4 text-xs text-zinc-400 mt-1">
                  <span className="flex items-center gap-1">
                    <Calendar className="w-3 h-3" />
                    {format(new Date(plan.startDate), "dd MMM yyyy")}
                  </span>
                  {plan.endDate && (
                    <span className="flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      {format(new Date(plan.endDate), "dd MMM yyyy")}
                    </span>
                  )}
                </div>
                {idx === 0 && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.2 }}
                    className="mt-4 flex gap-3 justify-end"
                  >
                    <Button
                      variant="default"
                      className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold px-5"
                      onClick={() => router.push("/upgrade")}
                    >
                      Upgrade Plan
                    </Button>
                    {!isFree && isCancelable && (
                      <Button
                        variant="outline"
                        className="border-red-400 text-red-500 hover:bg-red-50 hover:text-red-600 px-5"
                        onClick={() => setShowCancel(true)}
                      >
                        Cancel Plan
                      </Button>
                    )}
                  </motion.div>
                )}
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
        {/* Plan cancellation dialog/modal can be conditionally rendered here if showCancel is true */}
        {showCancel && (
          <PlanCancellationDialog
            open={showCancel}
            onOpenChange={setShowCancel}
            currentPlan={currentPlan?.name || "free"}
            currentPlanPrice={currentPlan?.price || 0}
          />
        )}
      </DialogContent>
    </Dialog>
  );
} 