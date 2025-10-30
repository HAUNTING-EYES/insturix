"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useUser } from "@clerk/nextjs";
import { motion } from "framer-motion";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Check, ChevronRight, AlertCircle, Sparkles, Clock } from "lucide-react";
import Link from "next/link";
import { useToast } from "@/hooks/use-toast";
import UpgradeConfirmationModal from "../../../../components/ics25/UpgradeConfirmationModal";
import CreatorUpgradeForm from "../../../../components/ics25/CreatorUpgradeForm";

type Tier = "bronze" | "silver" | "gold" | "creators";

const TIER_PRICING: Record<Tier, { label: string; amount: number; perks: string[]; gradient: string; badgeColor: string; dotColor: string }> = {
  bronze: { 
    label: "Bronze", 
    amount: 0,
    gradient: "from-amber-600/35 via-white/20 to-amber-800/35",
    badgeColor: "bg-amber-600",
    dotColor: "bg-amber-600",
    perks: [
      "Access to panel talks",
      "Access to speaker sessions",
      "Audience Access to Creator Awards"
    ]
  },
  silver: { 
    label: "Silver", 
    amount: 2500,
    gradient: "from-white/65 via-white/20 to-gray-200/85",
    badgeColor: "bg-gray-300",
    dotColor: "bg-white",
    perks: [
      "Everything in Bronze",
      "Participate in Reel making showdown",
      "Speed Edits",
      "Access to quite rooms and Gaming Zones",
      "Talent Showdown"
    ]
  },
  gold: { 
    label: "Gold", 
    amount: 5000,
    gradient: "from-yellow-400/35 via-white/20 to-yellow-600/35",
    badgeColor: "bg-yellow-500",
    dotColor: "bg-yellow-500",
    perks: [
      "Everything in Silver",
      "Networking lounge",
      "Lunch both days",
      "Exclusive merch",
      "1 yr Insturix Pro Subscription"
    ]
  },
  creators: { 
    label: "Creators", 
    amount: 3000,
    gradient: "from-red-500/35 via-white/20 to-red-700/35",
    badgeColor: "bg-red-500",
    dotColor: "bg-red-500",
    perks: [
      "Everything in Gold",
      "Priority Access",
      "Brand Shoutout",
      "Featuring on Banner"
    ]
  },
};

const UPGRADE_PATHS: Record<Tier, Tier[]> = {
  bronze: ["silver", "gold", "creators"],
  silver: ["gold", "creators"],
  gold: ["creators"],
  creators: [], // No upgrades from creators
};

export default function ConfirmationPage() {
  const { user } = useUser();
  const router = useRouter();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [attendee, setAttendee] = useState<any>(null);
  const [selectedUpgrade, setSelectedUpgrade] = useState<Tier | null>(null);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [showCreatorForm, setShowCreatorForm] = useState(false);
  const [upgrading, setUpgrading] = useState(false);
  const [applicationStatus, setApplicationStatus] = useState<'none' | 'pending' | 'approved' | 'rejected'>('none');
  const [creatorStatusLoading, setCreatorStatusLoading] = useState(false);

  // Load Razorpay script
  useEffect(() => {
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.async = true;
    document.body.appendChild(script);
    return () => {
      document.body.removeChild(script);
    };
  }, []);

  useEffect(() => {
    if (!user) {
      router.push("/signin?redirect_url=/checkout/ics25/confirmation");
      return;
    }

    (async () => {
      try {
        const res = await fetch("/api/ics25/attendees");
        if (!res.ok) throw new Error("Failed to fetch attendee data");
        
        const data = await res.json();
        if (!data.attendee) {
          // No attendee record - redirect to checkout
          router.push("/checkout");
          return;
        }

        // Check if they've completed registration
        // Bronze is free (no payment required), others need payment
        const tier = data.attendee.attendeePassTier;
        const paymentStatus = data.attendee.payment?.status;
        
        if (tier !== 'bronze' && paymentStatus !== 'paid') {
          // Non-bronze passes require payment
          router.push("/checkout");
          return;
        }

        setAttendee(data.attendee);
        
        // Fetch creator application status if they're trying to upgrade to creators
        fetchCreatorStatus();
      } catch (e: any) {
        toast({
          title: "Error",
          description: e.message || "Failed to load your registration",
          variant: "destructive",
        });
      } finally {
        setLoading(false);
      }
    })();
  }, [user, router, toast]);

  const fetchCreatorStatus = async () => {
    try {
      setCreatorStatusLoading(true);
      const res = await fetch("/api/ics25/attendees/creator-status");
      if (res.ok) {
        const data = await res.json();
        setApplicationStatus(data.status || 'none');
      }
    } catch {
      // Silently fail - status stays as 'none'
    } finally {
      setCreatorStatusLoading(false);
    }
  };

  const handleUpgradeClick = (tier: Tier) => {
    setSelectedUpgrade(tier);
    if (tier === "creators") {
      // If application is pending, don't open anything
      if (applicationStatus === 'pending') return;
      
      // If approved, show payment instead of form
      if (applicationStatus === 'approved') {
        setShowUpgradeModal(true);
        return;
      }
      
      // Otherwise show the creator form (status is 'none' or 'rejected')
      setShowCreatorForm(true);
    } else {
      setShowUpgradeModal(true);
    }
  };

  const handleConfirmUpgrade = async () => {
    if (!selectedUpgrade) return;

    setUpgrading(true);
    try {
      const res = await fetch("/api/ics25/attendees/upgrade", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetTier: selectedUpgrade,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Upgrade failed");

      // If upgrade requires payment, redirect to Razorpay
      if (data.requiresPayment) {
        await initiatePayment(data);
      } else if (data.refundInitiated) {
        // For downgrades with refund
        toast({
          title: "Upgrade Successful!",
          description: `Your pass has been upgraded to ${TIER_PRICING[selectedUpgrade].label}. Refund of ₹${data.refundAmount} will be processed in 3-5 business days.`,
        });
        setShowUpgradeModal(false);
        // Refresh attendee data
        window.location.reload();
      } else {
        toast({
          title: "Upgrade Successful!",
          description: `Your pass has been upgraded to ${TIER_PRICING[selectedUpgrade].label}.`,
        });
        setShowUpgradeModal(false);
        window.location.reload();
      }
    } catch (e: any) {
      toast({
        title: "Upgrade Failed",
        description: e.message || "Failed to process upgrade",
        variant: "destructive",
      });
    } finally {
      setUpgrading(false);
    }
  };

  const initiatePayment = async (orderData: any) => {
    if (!orderData.key) {
      throw new Error('Payment service not configured');
    }

    const options = {
      key: orderData.key,
      order_id: orderData.orderId,
      amount: orderData.amount,
      currency: orderData.currency,
      name: "ICS'25 - Insturix",
      description: `Upgrade to ${selectedUpgrade ? TIER_PRICING[selectedUpgrade].label : ''}`,
      handler: async (response: any) => {
        try {
          const verifyRes = await fetch("/api/ics25/attendees/verify-upgrade", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              orderId: orderData.orderId,
              paymentId: response.razorpay_payment_id,
              signature: response.razorpay_signature,
              targetTier: selectedUpgrade,
            }),
          });

          const verifyData = await verifyRes.json();
          if (!verifyData.ok) throw new Error(verifyData.message || "Verification failed");

          toast({
            title: "Payment Successful!",
            description: "Your pass has been upgraded.",
          });
          setShowUpgradeModal(false);
          window.location.reload();
        } catch (e: any) {
          toast({
            title: "Payment Verification Failed",
            description: e.message || "Please contact support",
            variant: "destructive",
          });
        }
      },
      modal: {
        ondismiss: () => {
          setUpgrading(false);
          toast({
            title: "Payment Cancelled",
            description: "You can try upgrading again anytime.",
          });
        },
      },
      theme: {
        color: '#8b5cf6'
      }
    };

    const rzp = new (window as any).Razorpay(options);
    rzp.open();
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0A0A0C] flex items-center justify-center">
        <div className="text-white">Loading...</div>
      </div>
    );
  }

  if (!attendee) {
    return null;
  }

  const currentTier = attendee.attendeePassTier as Tier;
  const currentPricing = TIER_PRICING[currentTier];
  const availableUpgrades = UPGRADE_PATHS[currentTier];

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#0A0A0C]">
      {/* Unified soft gradient backdrop matching ICS25 */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute inset-0 bg-gradient-to-br from-zinc-950 via-zinc-950 to-zinc-950" />
        {/* Product-style glow blobs */}
        <div className="absolute inset-0">
          <div className="absolute -top-24 -right-24 w-[600px] h-[600px] rounded-full bg-gradient-to-br from-sky-500/15 via-transparent to-fuchsia-500/15 blur-3xl" />
          <div className="absolute -bottom-24 -left-24 w-[600px] h-[600px] rounded-full bg-gradient-to-br from-purple-500/15 via-transparent to-cyan-500/15 blur-3xl" />
        </div>
      </div>

      <div className="relative z-20">
        <Navbar />
      </div>

      <main className="relative z-10 max-w-6xl mx-auto px-4 py-16">
        {/* Success Banner */}
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="mb-8 rounded-3xl overflow-hidden p-[1px] bg-gradient-to-br from-emerald-500/35 via-white/20 to-emerald-600/35"
        >
          <div className="relative rounded-[22px] border border-white/10 bg-white/60 dark:bg-zinc-950/60 backdrop-blur-xl p-6">
            {/* Sheen effect */}
            <div aria-hidden className="pointer-events-none absolute inset-0 rounded-[22px] [mask-image:radial-gradient(200px_120px_at_0%_0%,rgba(255,255,255,0.15),transparent)]" />
            
            <div className="relative flex items-start gap-4">
              <div className="mt-1 flex-shrink-0 p-3 rounded-full bg-emerald-500/20 relative">
                <Check className="h-6 w-6 text-emerald-400" />
                
              </div>
              <div className="flex-1">
                <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight text-white mb-2">
                  Registration Successful! 🎉
                </h1>
                <p className="text-white/80">
                  You're all set for ICS'25! We've sent a confirmation email to <strong className="text-white">{attendee.email}</strong> with your event details and badge information.
                </p>
                {currentTier === 'creators' && (
                  <div className="mt-4 pt-4 border-t border-emerald-500/30">
                    <p className="text-sm text-emerald-300 flex items-center gap-2">
                      <Check className="h-4 w-4" />
                      <span><strong>Refund Processed:</strong> ₹2,000 will be credited to your bank account within 3-5 business days</span>
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </motion.div>

        {/* Current Pass Card */}
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          viewport={{ once: true }}
          className="mb-12"
        >
          <h2 className="text-xl font-bold text-white mb-4">Your Pass</h2>
          <div className={`rounded-3xl overflow-hidden p-[1px] bg-gradient-to-br ${currentPricing.gradient}`}>
            <div className="relative rounded-[22px] border border-white/10 bg-white/60 dark:bg-zinc-950/60 backdrop-blur-xl p-6">
              {/* Sheen effect */}
              <div aria-hidden className="pointer-events-none absolute inset-0 rounded-[22px] [mask-image:radial-gradient(200px_120px_at_0%_0%,rgba(255,255,255,0.15),transparent)]" />
              
              <div className="relative flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <div className={`w-3 h-3 rounded-full ${currentPricing.dotColor}`} />
                  <div>
                    <h3 className="text-2xl font-bold text-white">{currentPricing.label}</h3>
                    <p className="text-sm text-white/70">
                      {currentTier === "creators" ? "10k+ followers required" : "Active Pass"}
                    </p>
                  </div>
                </div>
                <div className={`${currentPricing.badgeColor} text-white text-xs font-medium px-3 py-1.5 rounded-full flex items-center gap-1.5`}>
                  <Check className="h-3 w-3" /> Paid
                </div>
              </div>
              
              <div className="relative space-y-2 mb-6">
                {currentPricing.perks.map((perk, idx) => (
                  <div key={idx} className="flex items-start gap-2 text-sm text-white/80">
                    <span className={`inline-block size-1.5 rounded-full flex-shrink-0 mt-1.5 ${currentPricing.dotColor}`} />
                    <span>{perk}</span>
                  </div>
                ))}
              </div>
              
              <div className="relative pt-4 border-t border-white/10">
                <div className="flex items-baseline gap-2">
                  <span className="text-3xl font-bold text-white">₹{currentPricing.amount.toLocaleString()}</span>
                  <span className="text-sm text-white/60">paid</span>
                </div>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Upgrade Options */}
        {availableUpgrades.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 14 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            viewport={{ once: true }}
          >
            <h2 className="text-xl font-bold text-white mb-4">Upgrade Your Pass</h2>
            <p className="text-white/70 mb-6">
              Get more value from ICS'25 by upgrading to a higher tier pass. 
              {currentTier === "gold" && " Note: Upgrading to Creators Pass will refund ₹2000 (takes 3-5 business days)."}
            </p>
            
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              {availableUpgrades.map((upgradeTier, index) => {
                const pricing = TIER_PRICING[upgradeTier];
                const priceDiff = pricing.amount - currentPricing.amount;
                const isRefund = priceDiff < 0;

                return (
                  <motion.div
                    key={upgradeTier}
                    initial={{ opacity: 0, y: 14 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5, delay: 0.3 + index * 0.1 }}
                    viewport={{ once: true }}
                    className={`rounded-3xl overflow-hidden p-[1px] bg-gradient-to-br ${pricing.gradient} group hover:shadow-lg transition-all`}
                  >
                    <div className="relative rounded-[22px] border border-white/10 bg-white/60 dark:bg-zinc-950/60 backdrop-blur-xl p-6 h-full flex flex-col">
                      {/* Sheen effect */}
                      <div aria-hidden className="pointer-events-none absolute inset-0 rounded-[22px] [mask-image:radial-gradient(200px_120px_at_0%_0%,rgba(255,255,255,0.15),transparent)]" />
                      
                      <div className="relative flex items-center gap-3 mb-2">
                        <h3 className="text-lg font-bold text-white">{pricing.label}</h3>
                      </div>
                      
                      {upgradeTier === "creators" ? (
                        <div className="relative text-xs text-white/70 mb-2 leading-relaxed">
                          <strong className="text-white">Validity:</strong> 10K+ followers on at least one of these platforms: Instagram, YouTube, or LinkedIn
                        </div>
                      ) : (
                        <div className="mb-2"></div>
                      )}

                      <div className="relative space-y-2 mb-4 flex-1">
                        {pricing.perks.map((perk, idx) => (
                          <div key={idx} className="flex items-start gap-2 text-xs text-white/70">
                            <span className={`inline-block size-1.5 rounded-full flex-shrink-0 mt-1 ${pricing.dotColor}`} />
                            <span>{perk}</span>
                          </div>
                        ))}
                      </div>

                      <div className="relative pt-4 border-t border-white/10 mb-4">
                        <div className="flex items-baseline gap-2">
                          {isRefund ? (
                            <>
                              <span className="text-2xl font-bold text-emerald-400">-₹{Math.abs(priceDiff).toLocaleString()}</span>
                              <span className="text-xs text-white/60">refund</span>
                            </>
                          ) : (
                            <>
                              <span className="text-2xl font-bold text-white">+₹{priceDiff.toLocaleString()}</span>
                              <span className="text-xs text-white/60">additional</span>
                            </>
                          )}
                        </div>
                      </div>

                      {isRefund && (
                        <div className="relative mb-4 p-3 rounded-lg bg-amber-500/10 border border-amber-600/20">
                          <div className="flex items-start gap-2">
                            <AlertCircle className="h-4 w-4 text-amber-400 mt-0.5 flex-shrink-0" />
                            <p className="text-xs text-amber-300">
                              Refund processed in 3-5 business days
                            </p>
                          </div>
                        </div>
                      )}

                      {upgradeTier === "creators" && applicationStatus === 'pending' ? (
                        <Button
                          disabled
                          className="w-full font-semibold rounded-xl bg-amber-500/20 hover:bg-amber-500/20 text-amber-300 border border-amber-500/50 flex items-center justify-center gap-2"
                        >
                          <Clock className="h-4 w-4" />
                          Under Review
                        </Button>
                      ) : (
                        <Button
                          onClick={() => handleUpgradeClick(upgradeTier)}
                          className={`w-full font-semibold rounded-xl transition-colors ${
                            pricing.label.toLowerCase().includes('gold')
                              ? "bg-yellow-500 hover:bg-yellow-600 text-white shadow-[0_0_30px_rgba(245,158,11,0.35)]"
                              : pricing.label.toLowerCase().includes('bronze')
                              ? "bg-amber-600 hover:bg-amber-700 text-white shadow-[0_0_30px_rgba(245,158,11,0.35)]"
                              : pricing.label.toLowerCase().includes('silver')
                              ? "bg-white hover:bg-gray-100 text-gray-800 shadow-[0_0_30px_rgba(255,255,255,0.35)]"
                              : pricing.label.toLowerCase().includes('creators')
                              ? "bg-red-500 hover:bg-red-600 text-white shadow-[0_0_30px_rgba(239,68,68,0.35)]"
                              : "bg-zinc-900/90 hover:bg-zinc-900 text-white border border-white/10"
                          }`}
                        >
                          {upgradeTier === "creators" && applicationStatus === 'rejected' ? 'Reapply' : `Upgrade to ${pricing.label}`}
                          <ChevronRight className="h-4 w-4 ml-1" />
                        </Button>
                      )}
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </motion.div>
        )}

        {/* Next Steps */}
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.5 }}
          viewport={{ once: true }}
          className="mt-12"
        >
          <div className="rounded-3xl overflow-hidden p-[1px] bg-gradient-to-br from-sky-500/35 via-white/20 to-purple-500/35">
            
          </div>
        </motion.div>

        {/* Action Buttons */}
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.6 }}
          viewport={{ once: true }}
          className="mt-8 flex flex-col sm:flex-row gap-4 justify-center"
        >
          <Button asChild variant="outline" className="border-white/20 bg-white/10 backdrop-blur-xl text-white hover:bg-white/20 rounded-xl font-semibold transition-all">
            <Link href="/ics25">Back to ICS'25</Link>
          </Button>
          {/* Dashboard link removed per request */}
        </motion.div>
      </main>

      <div className="relative z-20">
        <Footer />
      </div>

      {/* Upgrade Confirmation Modal
          Note: creators were previously excluded from this modal. We allow
          rendering it for Creators only when the application status is
          'approved' so users can complete payment. */}
      {showUpgradeModal && selectedUpgrade && (selectedUpgrade !== "creators" || applicationStatus === 'approved') && (
        <UpgradeConfirmationModal
          open={showUpgradeModal}
          onClose={() => {
            setShowUpgradeModal(false);
            setSelectedUpgrade(null);
            setUpgrading(false);
          }}
          onConfirm={handleConfirmUpgrade}
          currentTier={currentTier}
          targetTier={selectedUpgrade}
          currentPrice={currentPricing.amount}
          targetPrice={TIER_PRICING[selectedUpgrade].amount}
          upgrading={upgrading}
          startStep={selectedUpgrade === 'creators' && applicationStatus === 'approved' ? 2 : 1}
        />
      )}

      {/* Creator Upgrade Form */}
      {showCreatorForm && selectedUpgrade === "creators" && (
        <CreatorUpgradeForm
          open={showCreatorForm}
          onClose={() => {
            setShowCreatorForm(false);
            setSelectedUpgrade(null);
          }}
          currentTier={currentTier}
          currentPrice={currentPricing.amount}
          attendeeData={attendee}
          applicationStatus={applicationStatus}
        />
      )}
    </div>
  );
}