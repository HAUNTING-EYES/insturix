"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, ChevronUp, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useCredits, type CreditTransaction } from "@/hooks/useCredits";

interface CreditsCardProps {
  variant?: 'compact' | 'full';
  className?: string;
  onTopupClick?: () => void;
}

const transactionLabels = {
  subscription_grant: 'Plan Grant',
  topup: 'Top-up',
  usage: 'Used',
  refund: 'Refund',
  expiry: 'Expired',
  adjustment: 'Adjustment',
};

export function CreditsCard({ variant = 'compact', className, onTopupClick }: CreditsCardProps) {
  const { balance, transactions, isLoading, error } = useCredits();
  const [expanded, setExpanded] = useState(false);

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const formatExpiry = (dateStr: string | null) => {
    if (!dateStr) return null;
    const date = new Date(dateStr);
    const now = new Date();
    const daysLeft = Math.ceil((date.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    if (daysLeft <= 0) return 'Expired';
    if (daysLeft === 1) return '1d left';
    return `${daysLeft}d left`;
  };

  if (isLoading) {
    return (
      <div className={cn("rounded-lg border border-border/50 bg-card/50 p-4", className)}>
        <div className="animate-pulse flex items-center gap-3">
          <div className="flex-1 space-y-2">
            <div className="h-5 bg-muted rounded w-16" />
            <div className="h-2 bg-muted rounded w-24" />
          </div>
        </div>
      </div>
    );
  }

  if (error || !balance) {
    return (
      <div className={cn("rounded-lg border border-border/50 bg-card/50 p-4", className)}>
        <p className="text-sm text-muted-foreground">{error || 'Credits unavailable'}</p>
      </div>
    );
  }

  const maxCredits = Math.max(balance.subscriptionCredits + balance.topupCredits, 100);
  const expiryText = formatExpiry(balance.subscriptionCreditsExpiry);

  return (
    <div className={cn("relative", className)}>
      {/* Compact Card */}
      <motion.div
        className={cn(
          "rounded-lg border border-border/50 bg-card/80 backdrop-blur-sm cursor-pointer",
          "hover:border-border transition-colors",
          expanded && "border-border"
        )}
        onClick={() => setExpanded(!expanded)}
        whileHover={{ scale: 1.005 }}
        whileTap={{ scale: 0.995 }}
      >
        <div className="p-4 flex items-center gap-4">
          {/* Balance */}
          <div className="flex-1 min-w-0">
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-semibold tabular-nums">
                {balance.totalCredits.toLocaleString()}
              </span>
              <span className="text-sm text-muted-foreground">credits</span>
            </div>
            
            {/* Progress bar */}
            <div className="mt-2 h-1 bg-muted rounded-full overflow-hidden">
              <motion.div
                className="h-full rounded-full bg-foreground/20"
                initial={{ width: 0 }}
                animate={{ width: `${Math.min((balance.totalCredits / maxCredits) * 100, 100)}%` }}
                transition={{ duration: 0.5 }}
              />
            </div>

            {/* Breakdown hint */}
            <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
              <span>{balance.subscriptionCredits} plan</span>
              <span className="opacity-50">·</span>
              <span>{balance.topupCredits} topup</span>
              {expiryText && (
                <>
                  <span className="opacity-50">·</span>
                  <span className="text-muted-foreground">{expiryText}</span>
                </>
              )}
            </div>
          </div>

          {/* Expand/collapse */}
          <div className="text-muted-foreground">
            {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </div>
        </div>
      </motion.div>

      {/* Expanded Popup */}
      <AnimatePresence>
        {expanded && (
          <>
            {/* Backdrop */}
            <motion.div
              className="fixed inset-0 bg-black/20 backdrop-blur-sm z-40"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setExpanded(false)}
            />
            
            {/* Popup */}
            <motion.div
              className={cn(
                "absolute left-0 right-0 mt-2 z-50",
                "rounded-lg border border-border bg-card shadow-lg"
              )}
              initial={{ opacity: 0, y: -10, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -10, scale: 0.98 }}
              transition={{ type: "spring", damping: 25, stiffness: 350 }}
            >
              {/* Header */}
              <div className="p-4 border-b border-border flex items-center justify-between">
                <h3 className="text-sm font-medium">Credits Balance</h3>
                <button
                  onClick={(e) => { e.stopPropagation(); setExpanded(false); }}
                  className="p-1 rounded-md hover:bg-muted transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Balance Breakdown */}
              <div className="p-4 space-y-3">
                <div className="flex justify-between items-center text-sm">
                  <span className="text-muted-foreground">Plan Credits</span>
                  <span className="font-medium tabular-nums">{balance.subscriptionCredits}</span>
                </div>
                <div className="flex justify-between items-center text-sm">
                  <span className="text-muted-foreground">Top-up Credits</span>
                  <span className="font-medium tabular-nums">{balance.topupCredits}</span>
                </div>
                {expiryText && (
                  <p className="text-xs text-muted-foreground">
                    Plan credits reset: {expiryText}
                  </p>
                )}
              </div>

              {/* Recent Transactions */}
              {transactions.length > 0 && (
                <div className="border-t border-border">
                  <div className="p-3 pb-2">
                    <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Recent</h4>
                  </div>
                  <div className="max-h-40 overflow-y-auto">
                    {transactions.slice(0, 5).map((txn) => {
                      const isPositive = txn.amount > 0;
                      return (
                        <div
                          key={txn.id}
                          className="px-4 py-2 flex items-center gap-3 text-sm"
                        >
                          <div className="flex-1 min-w-0">
                            <p className="font-medium truncate">
                              {transactionLabels[txn.type]}
                              {txn.service && <span className="text-muted-foreground font-normal"> · {txn.service}</span>}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {formatDate(txn.timestamp)}
                            </p>
                          </div>
                          <span className={cn(
                            "font-medium tabular-nums",
                            isPositive ? "text-foreground" : "text-muted-foreground"
                          )}>
                            {isPositive ? '+' : ''}{txn.amount}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Top-up Button */}
              <div className="p-4 border-t border-border">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onTopupClick?.();
                  }}
                  className={cn(
                    "w-full py-2.5 rounded-lg text-sm font-medium",
                    "bg-foreground text-background",
                    "hover:bg-foreground/90 transition-colors"
                  )}
                >
                  Add Credits
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

// Mini badge version for headers/navbars
export function CreditsBadge({ className }: { className?: string }) {
  const { balance, isLoading } = useCredits();

  if (isLoading || !balance) return null;

  return (
    <div className={cn(
      "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium",
      "bg-muted text-muted-foreground",
      className
    )}>
      <motion.span 
        className="tabular-nums"
        animate={{ 
          color: ["#B5B2A8", "#D4A652", "#B5B2A8"],
          textShadow: [
            "0 0 0px rgba(212, 166, 82, 0)",
            "0 0 8px rgba(212, 166, 82, 0.4)",
            "0 0 0px rgba(212, 166, 82, 0)"
          ]
        }}
        transition={{
          duration: 4,
          repeat: Infinity,
          ease: "easeInOut"
        }}
      >
        {balance.totalCredits.toLocaleString()}
      </motion.span>
      <span className="opacity-70">cr</span>
    </div>
  );
}
