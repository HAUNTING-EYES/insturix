"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { useCredits, CreditTransaction } from "@/hooks/useCredits";
import { CreditsTopupModal } from "@/components/shared/CreditsTopupModal";
import { CreditCard, Coins, ArrowUpRight, ArrowDownRight, RefreshCw, Gift, Clock, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";
import Link from "next/link";

const transactionIcons = {
  subscription_grant: Gift,
  topup: Coins,
  usage: ArrowDownRight,
  refund: RefreshCw,
  expiry: Clock,
  adjustment: RefreshCw,
};

const transactionLabels = {
  subscription_grant: 'Plan Grant',
  topup: 'Top-up',
  usage: 'Used',
  refund: 'Refund',
  expiry: 'Expired',
  adjustment: 'Adjustment',
};

export default function BillingPage() {
  const { balance, transactions, isLoading, error, invalidateCredits } = useCredits();
  const [showTopupModal, setShowTopupModal] = useState(false);

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const formatExpiry = (dateStr: string | null) => {
    if (!dateStr) return null;
    const date = new Date(dateStr);
    const now = new Date();
    const daysLeft = Math.ceil((date.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    if (daysLeft <= 0) return 'Expired';
    if (daysLeft === 1) return '1 day remaining';
    return `${daysLeft} days remaining`;
  };

  if (isLoading) {
    return (
      <div className="p-6 max-w-4xl mx-auto">
        <div className="animate-pulse space-y-6">
          <div className="h-8 bg-muted rounded w-48" />
          <div className="h-40 bg-muted rounded-xl" />
          <div className="h-64 bg-muted rounded-xl" />
        </div>
      </div>
    );
  }

  if (error || !balance) {
    return (
      <div className="p-6 max-w-4xl mx-auto">
        <div className="rounded-xl border border-destructive/50 bg-destructive/10 p-6 text-center">
          <p className="text-destructive font-medium">Failed to load billing information</p>
          <p className="text-sm text-muted-foreground mt-1">{error || 'Please try again later'}</p>
          <button 
            onClick={() => invalidateCredits()}
            className="mt-4 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  const expiryText = formatExpiry(balance.subscriptionCreditsExpiry);

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Billing & Credits</h1>
          <p className="text-muted-foreground text-sm mt-1">Manage your credits and subscription</p>
        </div>
        <Link 
          href="/upgrade"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-border bg-card hover:bg-muted transition text-sm font-medium"
        >
          Manage Plan
          <ExternalLink className="w-4 h-4" />
        </Link>
      </div>

      {/* Credit Balance Card */}
      <motion.div 
        className="rounded-xl border border-border bg-card overflow-hidden"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <div className="p-6">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm text-muted-foreground font-medium">Total Credits</p>
              <p className="text-4xl font-bold tabular-nums mt-1">
                {balance.totalCredits.toLocaleString()}
              </p>
            </div>
            <div className="p-3 rounded-xl bg-primary/10">
              <Coins className="w-6 h-6 text-primary" />
            </div>
          </div>

          {/* Credit Breakdown */}
          <div className="mt-6 grid grid-cols-2 gap-4">
            <div className="p-4 rounded-lg bg-muted/50">
              <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">Subscription</p>
              <p className="text-xl font-semibold tabular-nums mt-1">{balance.subscriptionCredits}</p>
              {expiryText && (
                <p className="text-xs text-muted-foreground mt-1">{expiryText}</p>
              )}
            </div>
            <div className="p-4 rounded-lg bg-muted/50">
              <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">Top-up</p>
              <p className="text-xl font-semibold tabular-nums mt-1">{balance.topupCredits}</p>
              <p className="text-xs text-muted-foreground mt-1">Never expires</p>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="mt-6 flex gap-3">
            <button
              onClick={() => setShowTopupModal(true)}
              className="flex-1 py-3 rounded-lg bg-primary text-primary-foreground font-medium hover:bg-primary/90 transition"
            >
              Buy Credits
            </button>
          </div>
        </div>
      </motion.div>

      {/* Transaction History */}
      <motion.div 
        className="rounded-xl border border-border bg-card"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
      >
        <div className="p-4 border-b border-border">
          <h2 className="font-semibold">Transaction History</h2>
        </div>

        {transactions.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground">
            <Coins className="w-10 h-10 mx-auto mb-3 opacity-50" />
            <p>No transactions yet</p>
            <p className="text-sm mt-1">Your credit activity will appear here</p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {transactions.map((txn) => {
              const Icon = transactionIcons[txn.type] || Coins;
              const isPositive = txn.amount > 0;
              return (
                <div key={txn.id} className="p-4 flex items-center gap-4">
                  <div className={cn(
                    "p-2 rounded-lg",
                    isPositive ? "bg-green-500/10" : "bg-muted"
                  )}>
                    <Icon className={cn(
                      "w-4 h-4",
                      isPositive ? "text-green-500" : "text-muted-foreground"
                    )} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm">
                      {transactionLabels[txn.type]}
                      {txn.service && (
                        <span className="text-muted-foreground font-normal"> · {txn.service}</span>
                      )}
                    </p>
                    <p className="text-xs text-muted-foreground">{formatDate(txn.timestamp)}</p>
                  </div>
                  <div className="text-right">
                    <p className={cn(
                      "font-semibold tabular-nums",
                      isPositive ? "text-green-500" : "text-foreground"
                    )}>
                      {isPositive ? '+' : ''}{txn.amount}
                    </p>
                    <p className="text-xs text-muted-foreground tabular-nums">
                      Balance: {txn.balanceAfter}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </motion.div>

      {/* Top-up Modal */}
      <CreditsTopupModal 
        isOpen={showTopupModal} 
        onClose={() => setShowTopupModal(false)} 
      />
    </div>
  );
}
