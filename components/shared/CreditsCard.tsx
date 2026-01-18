"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { 
  Coins, 
  ChevronDown, 
  ChevronUp, 
  Zap, 
  Clock, 
  Plus,
  TrendingDown,
  Gift,
  RefreshCw,
  X
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useCredits, type CreditsBalance, type CreditTransaction } from "@/hooks/useCredits";

interface CreditsCardProps {
  variant?: 'compact' | 'full';
  className?: string;
  onTopupClick?: () => void;
}

const transactionIcons = {
  subscription_grant: Gift,
  topup: Plus,
  usage: TrendingDown,
  refund: RefreshCw,
  expiry: Clock,
  adjustment: Zap,
};

const transactionLabels = {
  subscription_grant: 'Subscription Grant',
  topup: 'Credit Top-up',
  usage: 'Usage',
  refund: 'Refund',
  expiry: 'Expired',
  adjustment: 'Adjustment',
};

export function CreditsCard({ variant = 'compact', className, onTopupClick }: CreditsCardProps) {
  const { balance, transactions, isLoading, error } = useCredits();
  const [expanded, setExpanded] = useState(false);

  const getCreditsColor = (total: number) => {
    if (total <= 10) return 'text-red-500';
    if (total <= 50) return 'text-yellow-500';
    return 'text-emerald-500';
  };

  const getCreditsBarColor = (total: number, max: number) => {
    const percentage = (total / max) * 100;
    if (percentage <= 20) return 'bg-red-500';
    if (percentage <= 50) return 'bg-yellow-500';
    return 'bg-emerald-500';
  };

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
    if (daysLeft === 1) return '1 day left';
    return `${daysLeft} days left`;
  };

  if (isLoading) {
    return (
      <div className={cn("rounded-xl border border-border/50 bg-card/50 p-4", className)}>
        <div className="animate-pulse flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-muted" />
          <div className="flex-1 space-y-2">
            <div className="h-4 bg-muted rounded w-20" />
            <div className="h-3 bg-muted rounded w-32" />
          </div>
        </div>
      </div>
    );
  }

  if (error || !balance) {
    return (
      <div className={cn("rounded-xl border border-red-500/20 bg-red-500/5 p-4", className)}>
        <p className="text-sm text-red-500">{error || 'Credits unavailable'}</p>
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
          "rounded-xl border border-border/50 bg-card/80 backdrop-blur-sm cursor-pointer",
          "hover:border-primary/30 transition-colors",
          expanded && "border-primary/50"
        )}
        onClick={() => setExpanded(!expanded)}
        whileHover={{ scale: 1.01 }}
        whileTap={{ scale: 0.99 }}
      >
        <div className="p-4 flex items-center gap-4">
          {/* Icon */}
          <div className={cn(
            "w-10 h-10 rounded-full flex items-center justify-center",
            "bg-gradient-to-br from-amber-500/20 to-orange-500/20"
          )}>
            <Coins className="w-5 h-5 text-amber-500" />
          </div>

          {/* Balance */}
          <div className="flex-1 min-w-0">
            <div className="flex items-baseline gap-2">
              <span className={cn("text-2xl font-bold", getCreditsColor(balance.totalCredits))}>
                {balance.totalCredits.toLocaleString()}
              </span>
              <span className="text-sm text-muted-foreground">credits</span>
            </div>
            
            {/* Progress bar */}
            <div className="mt-1.5 h-1.5 bg-muted rounded-full overflow-hidden">
              <motion.div
                className={cn("h-full rounded-full", getCreditsBarColor(balance.totalCredits, maxCredits))}
                initial={{ width: 0 }}
                animate={{ width: `${Math.min((balance.totalCredits / maxCredits) * 100, 100)}%` }}
                transition={{ duration: 0.5 }}
              />
            </div>

            {/* Breakdown hint */}
            <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
              <span>{balance.subscriptionCredits} sub</span>
              <span>•</span>
              <span>{balance.topupCredits} topup</span>
              {expiryText && (
                <>
                  <span>•</span>
                  <span className="text-amber-500">{expiryText}</span>
                </>
              )}
            </div>
          </div>

          {/* Expand/collapse */}
          <div className="text-muted-foreground">
            {expanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
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
                "rounded-xl border border-border bg-card shadow-xl"
              )}
              initial={{ opacity: 0, y: -10, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -10, scale: 0.95 }}
              transition={{ type: "spring", damping: 20, stiffness: 300 }}
            >
              {/* Header */}
              <div className="p-4 border-b border-border flex items-center justify-between">
                <h3 className="font-semibold">Credits Balance</h3>
                <button
                  onClick={(e) => { e.stopPropagation(); setExpanded(false); }}
                  className="p-1 rounded-md hover:bg-muted transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Balance Breakdown */}
              <div className="p-4 space-y-3">
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-blue-500" />
                    <span className="text-sm">Subscription Credits</span>
                  </div>
                  <span className="font-medium">{balance.subscriptionCredits}</span>
                </div>
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-emerald-500" />
                    <span className="text-sm">Top-up Credits</span>
                  </div>
                  <span className="font-medium">{balance.topupCredits}</span>
                </div>
                {expiryText && (
                  <p className="text-xs text-amber-500 flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    Subscription credits: {expiryText}
                  </p>
                )}
              </div>

              {/* Recent Transactions */}
              {transactions.length > 0 && (
                <div className="border-t border-border">
                  <div className="p-3 pb-2">
                    <h4 className="text-xs font-medium text-muted-foreground uppercase">Recent Activity</h4>
                  </div>
                  <div className="max-h-48 overflow-y-auto">
                    {transactions.slice(0, 5).map((txn) => {
                      const Icon = transactionIcons[txn.type];
                      const isPositive = txn.amount > 0;
                      return (
                        <div
                          key={txn.id}
                          className="px-4 py-2 flex items-center gap-3 hover:bg-muted/50 transition-colors"
                        >
                          <div className={cn(
                            "w-7 h-7 rounded-full flex items-center justify-center",
                            isPositive ? "bg-emerald-500/10" : "bg-red-500/10"
                          )}>
                            <Icon className={cn(
                              "w-3.5 h-3.5",
                              isPositive ? "text-emerald-500" : "text-red-500"
                            )} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">
                              {transactionLabels[txn.type]}
                              {txn.service && <span className="text-muted-foreground"> • {txn.service}</span>}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {formatDate(txn.timestamp)}
                            </p>
                          </div>
                          <span className={cn(
                            "text-sm font-medium",
                            isPositive ? "text-emerald-500" : "text-red-500"
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
                    "w-full py-2.5 rounded-lg font-medium text-sm",
                    "bg-gradient-to-r from-amber-500 to-orange-500 text-white",
                    "hover:from-amber-600 hover:to-orange-600 transition-all",
                    "flex items-center justify-center gap-2"
                  )}
                >
                  <Plus className="w-4 h-4" />
                  Top-up Credits
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

  const getColor = () => {
    if (balance.totalCredits <= 10) return 'bg-red-500/10 text-red-500 border-red-500/20';
    if (balance.totalCredits <= 50) return 'bg-amber-500/10 text-amber-500 border-amber-500/20';
    return 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20';
  };

  return (
    <div className={cn(
      "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border",
      getColor(),
      className
    )}>
      <Coins className="w-3 h-3" />
      {balance.totalCredits.toLocaleString()}
    </div>
  );
}
