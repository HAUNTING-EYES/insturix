"use client";

import { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import { useCredits, CreditTransaction } from "@/hooks/useCredits";
import { BillingPaymentModal } from "@/components/shared/BillingPaymentModal";
import { Coins, ArrowUpRight, ArrowDownRight, RefreshCw, Gift, Clock, Crown, Calendar, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import Link from "next/link";

interface CurrentPlan {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  price: number;
  currency: string;
  status: string;
}

const transactionIcons = {
  subscription_grant: Gift,
  topup: ArrowUpRight,
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
  const [currentPlan, setCurrentPlan] = useState<CurrentPlan | null>(null);
  const [planLoading, setPlanLoading] = useState(true);
  const searchParams = useSearchParams();
  const upgradePlanId = searchParams.get('upgrade');

  useEffect(() => {
    if (upgradePlanId) {
      setShowTopupModal(true);
    }
  }, [upgradePlanId]);

  // Fetch current plan
  useEffect(() => {
    async function fetchPlan() {
      try {
        const res = await fetch('/api/user/plans');
        const data = await res.json();
        if (data.currentPlan) {
          setCurrentPlan(data.currentPlan);
        }
      } catch (err) {
        console.error('Failed to fetch plan:', err);
      } finally {
        setPlanLoading(false);
      }
    }
    fetchPlan();
  }, []);

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

  const formatPlanDate = (dateStr: string | null | undefined) => {
    if (!dateStr) return 'Lifetime';
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return 'Lifetime';
    return date.toLocaleDateString('en-US', { 
      month: 'long', 
      day: 'numeric', 
      year: 'numeric',
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

  if (isLoading || planLoading) {
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
  const planExpiryText = currentPlan?.endDate ? formatExpiry(currentPlan.endDate) : null;

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Credits</h1>
          <p className="text-muted-foreground text-sm mt-1">Manage your subscription and credits</p>
        </div>
        <Link 
          href="/upgrade"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 transition text-xs font-bold uppercase tracking-wider"
        >
          {currentPlan ? 'Upgrade Plan' : 'Get Started'}
          <ArrowUpRight className="w-3 h-3" />
        </Link>
      </div>

      {/* Current Plan Card */}
      <motion.div 
        className="rounded-xl border border-border bg-card overflow-hidden"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <div className="p-6">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-[10px] font-bold text-white/40 uppercase tracking-widest">Current Plan</p>
              <p className="text-3xl font-black text-white mt-1">
                {currentPlan?.name && currentPlan.name.toLowerCase() !== 'free' ? currentPlan.name : 'Insturix Free'}
              </p>
              {(currentPlan?.status === 'active' || !currentPlan) && (
                <p className="text-sm text-green-500 mt-1 flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                  Active
                </p>
              )}
            </div>
            <div className="p-3 rounded-xl bg-white/5 border border-white/10">
              <Crown className="w-5 h-5 text-amber-400" />
            </div>
          </div>

          {currentPlan ? (
            <div className="mt-6 grid grid-cols-2 gap-4">
              <div className="p-4 rounded-lg bg-muted/50">
                <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium flex items-center gap-1">
                  <Calendar className="w-3 h-3" /> Started
                </p>
                <p className="text-sm font-medium mt-1">{formatPlanDate(currentPlan.startDate)}</p>
              </div>
              <div className="p-4 rounded-lg bg-muted/50">
                <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium flex items-center gap-1">
                  <Clock className="w-3 h-3" /> {currentPlan.endDate ? 'Renews' : 'Status'}
                </p>
                <p className="text-sm font-medium mt-1">
                  {currentPlan.endDate ? formatPlanDate(currentPlan.endDate) : 'Never Expires'}
                </p>
                {planExpiryText && (
                  <p className="text-xs text-muted-foreground">{planExpiryText}</p>
                )}
              </div>
            </div>
          ) : (
            <div className="mt-4 p-4 rounded-lg bg-muted/30 border border-white/5">
              <p className="text-sm text-muted-foreground">
                You&apos;re on the Free plan. Upgrade to get monthly credits and unlock premium features.
              </p>
            </div>
          )}

          {/* Plan Actions */}
          <div className="mt-6 flex gap-3">
            <Link
              href="/upgrade"
              className="flex-1 py-3 rounded-lg bg-primary text-primary-foreground font-medium hover:bg-primary/90 transition text-center"
            >
              {currentPlan ? 'Change Plan' : 'Subscribe Now'}
            </Link>
            {currentPlan && currentPlan.status === 'active' && (
              <button
                onClick={() => {
                  // TODO: Implement cancel subscription flow via Razorpay
                  alert('Please contact support@insturix.com to cancel your subscription.');
                }}
                className="px-4 py-3 rounded-lg border border-destructive/30 text-destructive hover:bg-destructive/10 transition flex items-center gap-2 text-sm font-medium"
              >
                <XCircle className="w-4 h-4" />
                Cancel
              </button>
            )}
          </div>
        </div>
      </motion.div>

      {/* Credit Balance Card */}
      <motion.div 
        className="rounded-xl border border-border bg-card overflow-hidden"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <div className="p-6">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-[10px] font-bold text-white/40 uppercase tracking-widest">Available Balance</p>
              <p className="text-5xl font-black text-white tabular-nums mt-1">
                {balance.totalCredits.toLocaleString()}
              </p>
            </div>
            <div className="p-3 rounded-xl bg-white/5 border border-white/10">
              <RefreshCw className="w-5 h-5 text-white/40" />
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
          <div className="p-12 text-center text-white/20">
            <div className="w-12 h-12 rounded-full border border-white/5 bg-white/[0.02] flex items-center justify-center mx-auto mb-4">
              <Clock className="w-5 h-5 opacity-50" />
            </div>
            <p className="text-sm font-medium">No transactions yet</p>
            <p className="text-xs mt-1">Activity from your purchases and usage will appear here</p>
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
      <BillingPaymentModal 
        isOpen={showTopupModal} 
        onClose={() => {
          setShowTopupModal(false);
          // Clear URL param when closing
          if (upgradePlanId) {
            window.history.replaceState({}, '', '/dashboard/billing');
          }
        }}
        initialPackageId={upgradePlanId}
        onSuccess={() => {
          invalidateCredits();
          // Refetch plan after successful subscription
          fetch('/api/user/plans')
            .then(res => res.json())
            .then(data => {
              if (data.currentPlan) setCurrentPlan(data.currentPlan);
            });
        }}
      />
    </div>
  );
}
