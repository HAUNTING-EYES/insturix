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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AlertTriangle, ArrowRight, Check, AlertCircle, Users, Zap, Clock } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

type Tier = "bronze" | "silver" | "gold" | "platinum" | "creators";

const TIER_LABELS: Record<Tier, string> = {
  bronze: "Bronze Pass",
  silver: "Silver Pass",
  gold: "Gold Pass",
  platinum: "Platinum Pass",
  creators: "Creators Pass",
};

const TIER_COLORS: Record<Tier, { 
  gradient: string; 
  text: string;
}> = {
  bronze: {
    gradient: "from-amber-600 via-amber-500 to-amber-700",
    text: "text-amber-500"
  },
  silver: {
    gradient: "from-gray-300 via-gray-100 to-gray-400",
    text: "text-gray-300"
  },
  gold: {
    gradient: "from-yellow-400 via-yellow-300 to-yellow-500",
    text: "text-yellow-400"
  },
  platinum: {
    gradient: "from-zinc-400 via-zinc-300 to-zinc-500",
    text: "text-zinc-300"
  },
  creators: {
    gradient: "from-red-500 via-red-400 to-red-600",
    text: "text-red-400"
  }
};

interface CreatorUpgradeFormProps {
  open: boolean;
  onClose: () => void;
  currentTier: Tier;
  currentPrice: number;
  attendeeData: any;
  applicationStatus?: 'none' | 'pending' | 'approved' | 'rejected';
}

export default function CreatorUpgradeForm({
  open,
  onClose,
  currentTier,
  currentPrice,
  attendeeData,
  applicationStatus = 'none',
}: CreatorUpgradeFormProps) {
  const { toast } = useToast();
  const [confirmationStep, setConfirmationStep] = useState<1 | 2>(1);
  const [submitting, setSubmitting] = useState(false);
  const [localApplicationStatus, setLocalApplicationStatus] = useState(applicationStatus);
  const [loadingStatus, setLoadingStatus] = useState(false);
  
  // Form fields
  const [instagram, setInstagram] = useState(attendeeData?.instagram || "");
  const [linkedin, setLinkedin] = useState(attendeeData?.linkedin || "");
  const [youtube, setYoutube] = useState("");

  const targetPrice = 3000; // Creators pass
  const priceDiff = targetPrice - currentPrice;
  const isRefund = priceDiff < 0;
  const amount = Math.abs(priceDiff);

  // Use passed applicationStatus or fetch if not provided
  useEffect(() => {
    if (applicationStatus && applicationStatus !== 'none') {
      setLocalApplicationStatus(applicationStatus);
    } else if (open && !applicationStatus) {
      setLoadingStatus(true);
      fetch('/api/ics25/attendees/creator-status')
        .then(res => res.json())
        .then(data => {
          if (data.ok && data.status) {
            setLocalApplicationStatus(data.status);
          }
        })
        .catch(err => console.error('Failed to fetch creator status:', err))
        .finally(() => setLoadingStatus(false));
    }
  }, [open, applicationStatus]);

  const handleClose = () => {
    setConfirmationStep(1);
    onClose();
  };

  const handleFirstConfirm = () => {
    // Validate social links (more permissive & domain-aware)
    if (!instagram.trim() || !linkedin.trim()) {
      toast({
        title: "Missing Information",
        description: "Instagram and LinkedIn links are required",
        variant: "destructive",
      });
      return;
    }

    const normalize = (v: string, platform: 'instagram' | 'linkedin' | 'youtube') => {
      let s = (v || '').trim();
      if (!s) return "";
      // Instagram: allow plain handles (username), @handles, or full URLs
      if (platform === 'instagram') {
        if (s.startsWith('@')) s = s.slice(1);
        // if it's a plain username (no dots or slashes), convert to url
        if (!/^https?:\/\//i.test(s)) return `https://instagram.com/${s.replace(/^@/, '')}`;
      }
      // LinkedIn and YouTube: ensure scheme present
      if (!/^https?:\/\//i.test(s)) s = `https://${s}`;
      return s;
    };

    const isInstagramUrl = (v: string) => {
      try {
        const u = new URL(normalize(v, 'instagram'));
        return u.hostname.toLowerCase().includes("instagram.com") || /^[A-Za-z0-9._]+$/.test(String(v).trim().replace(/^@/, ''));
      } catch {
        return false;
      }
    };

    const isLinkedinUrl = (v: string) => {
      try {
        const u = new URL(normalize(v, 'linkedin'));
        return u.hostname.toLowerCase().includes("linkedin.com");
      } catch {
        return false;
      }
    };

    const isYoutubeUrl = (v: string) => {
      try {
        const u = new URL(normalize(v, 'youtube'));
        const host = u.hostname.toLowerCase();
        return host.includes("youtube.com") || host.includes("youtu.be");
      } catch {
        return false;
      }
    };

    if (!isInstagramUrl(instagram)) {
      toast({
        title: "Invalid Instagram",
        description: "Please enter a valid Instagram profile (username, @handle, or URL)",
        variant: "destructive",
      });
      return;
    }

    if (!isLinkedinUrl(linkedin)) {
      toast({
        title: "Invalid LinkedIn",
        description: "Please enter a valid LinkedIn profile URL",
        variant: "destructive",
      });
      return;
    }

    if (youtube.trim() && !isYoutubeUrl(youtube)) {
      toast({
        title: "Invalid YouTube URL",
        description: "Please enter a valid YouTube URL or leave it empty",
        variant: "destructive",
      });
      return;
    }

    // Normalize stored values to full URLs for display/submit
    setInstagram(normalize(instagram, 'instagram'));
    setLinkedin(normalize(linkedin, 'linkedin'));
    if (youtube.trim()) setYoutube(normalize(youtube, 'youtube'));

    setConfirmationStep(2);
  };

  const handleFinalSubmit = async () => {
    setSubmitting(true);
    try {
      const res = await fetch("/api/ics25/attendees/upgrade-to-creator", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          instagram,
          linkedin,
          youtube: youtube.trim() || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Submission failed");

      toast({
        title: "Application Submitted!",
        description: "Your Creator Pass application has been submitted for review. We'll notify you within 48 hours.",
      });
      
      handleClose();
      // Reload page to show updated status
      setTimeout(() => window.location.reload(), 1500);
    } catch (e: any) {
      toast({
        title: "Submission Failed",
        description: e.message || "Failed to submit application",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-lg bg-transparent border-0 text-white p-0 max-h-[90vh] overflow-y-auto">
        <div className="rounded-3xl overflow-hidden p-[1px] bg-gradient-to-br from-white/10 via-white/5 to-white/10">
          <div className="relative rounded-[22px] bg-black/60 backdrop-blur-xl p-6 border border-white/5">
          {confirmationStep === 1 ? (
          <>
            <DialogHeader>
              <DialogTitle className="text-2xl text-center font-bold bg-gradient-to-r from-white to-white/80 bg-clip-text text-transparent">
                Upgrade to Creators Pass
              </DialogTitle>
              <DialogDescription className="text-center text-white/60">
                Provide your social media profiles for verification
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              {/* Eligibility Note */}
              <div className="p-[1px] rounded-[22px] bg-gradient-to-br from-white/12 via-white/6 to-transparent relative group">
                <div className="absolute inset-0 rounded-[22px] bg-gradient-to-br from-white/6 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />
                <div className="relative bg-black/55 backdrop-blur-xl rounded-[22px] p-4 border border-white/5">
                  <p className="text-xs text-white/70">
                    You must have <strong className="text-white">10K+ followers</strong> on at least one of these platforms: Instagram, YouTube, or LinkedIn.
                  </p>
                </div>
              </div>

              {/* Social Links Form */}
              <div className="space-y-4">
                <div>
                  <Label htmlFor="instagram" className="text-sm text-white/80">
                    Instagram Profile (URL or handle) <span className="text-red-400">*</span>
                  </Label>
                  <Input
                    id="instagram"
                    type="text"
                    placeholder="yourusername or @yourusername or https://instagram.com/yourusername"
                    value={instagram}
                    onChange={(e) => setInstagram(e.target.value)}
                    className="mt-1.5 bg-white/5 border-white/20 text-white placeholder:text-white/40 backdrop-blur-xl focus:border-purple-400/50 focus:ring-purple-400/25"
                  />
                </div>

                <div>
                  <Label htmlFor="linkedin" className="text-sm text-white/80">
                    LinkedIn Profile URL <span className="text-red-400">*</span>
                  </Label>
                  <Input
                    id="linkedin"
                    type="url"
                    placeholder="profile URL"
                    value={linkedin}
                    onChange={(e) => setLinkedin(e.target.value)}
                    className="mt-1.5 bg-white/5 border-white/20 text-white placeholder:text-white/40 backdrop-blur-xl focus:border-purple-400/50 focus:ring-purple-400/25"
                  />
                </div>

                <div>
                  <Label htmlFor="youtube" className="text-sm text-white/80">
                    YouTube Channel URL <span className="text-white/40">(optional)</span>
                  </Label>
                  <Input
                    id="youtube"
                    type="url"
                    placeholder="@yourchannel"
                    value={youtube}
                    onChange={(e) => setYoutube(e.target.value)}
                    className="mt-1.5 bg-white/5 border-white/20 text-white placeholder:text-white/40 backdrop-blur-xl focus:border-purple-400/50 focus:ring-purple-400/25"
                  />
                </div>
              </div>

              {/* Price Info */}
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
                <div className="p-[1px] rounded-[22px] bg-gradient-to-br from-emerald-500/30 via-emerald-600/20 to-transparent relative group">
                  <div className="absolute inset-0 rounded-[22px] bg-gradient-to-br from-white/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />
                  <div className="relative bg-black/55 backdrop-blur-xl rounded-[22px] p-4 border border-white/5">
                    <div className="flex items-start gap-3">
                      <Check className="h-5 w-5 text-emerald-400 mt-0.5 flex-shrink-0" />
                      <div className="flex-1">
                        <p className="text-sm font-medium text-emerald-300 mb-1">Good News!</p>
                        <p className="text-xs text-white/70">
                          Upon approval, you'll receive a refund of ₹{amount.toLocaleString()} within 3-5 business days.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Review Notice */}
              <div className="p-[1px] rounded-[22px] bg-gradient-to-br from-blue-500/30 via-blue-600/20 to-transparent relative group">
                <div className="absolute inset-0 rounded-[22px] bg-gradient-to-br from-white/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />
                <div className="relative bg-black/55 backdrop-blur-xl rounded-[22px] p-4 border border-white/5">
                  <div className="flex items-start gap-3">
                    <AlertCircle className="h-5 w-5 text-blue-400 mt-0.5 flex-shrink-0" />
                    <div className="flex-1">
                      <p className="text-sm font-medium text-blue-300 mb-1">Review Process</p>
                      <p className="text-xs text-white/70">
                        Our team will verify your follower count and approve within 48 hours. You'll be notified via email.
                      </p>
                    </div>
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
                {localApplicationStatus === 'pending' ? 'Close' : 'Cancel'}
              </Button>
              <div className="w-full sm:w-auto flex justify-end">
                {localApplicationStatus === 'pending' && (
                  <div className="flex items-center gap-2 px-6 py-3 bg-amber-500/20 border border-amber-500/50 rounded-xl text-amber-300">
                    <Clock className="h-4 w-4" />
                    <span className="font-semibold text-sm">Under Review</span>
                  </div>
                )}
                {localApplicationStatus === 'approved' && (
                  <Button
                    onClick={() => setConfirmationStep(2)}
                    className="px-8 py-3 bg-emerald-500 text-white font-semibold rounded-xl hover:bg-emerald-600 transition-all duration-300 flex items-center justify-center"
                  >
                    Complete Payment
                    <ArrowRight className="h-4 w-4 ml-2 text-white" />
                  </Button>
                )}
                {localApplicationStatus === 'rejected' && (
                  <Button
                    onClick={() => {
                      setLocalApplicationStatus('none');
                      setConfirmationStep(1);
                    }}
                    className="px-8 py-3 bg-blue-500 text-white font-semibold rounded-xl hover:bg-blue-600 transition-all duration-300 flex items-center justify-center"
                  >
                    Reapply
                    <ArrowRight className="h-4 w-4 ml-2 text-white" />
                  </Button>
                )}
                {localApplicationStatus === 'none' && (
                  <Button
                    onClick={handleFirstConfirm}
                    className="px-8 py-3 bg-white text-black font-semibold rounded-xl shadow-[0_12px_40px_rgba(255,255,255,0.08)] hover:shadow-[0_16px_50px_rgba(255,255,255,0.12)] transition-all duration-300 flex items-center justify-center"
                  >
                    Submit & Continue
                    <ArrowRight className="h-4 w-4 ml-2 text-black" />
                  </Button>
                )}
              </div>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="text-2xl text-center font-bold bg-gradient-to-r from-white to-white/80 bg-clip-text text-transparent">
                Submit for Review?
              </DialogTitle>
              <DialogDescription className="text-center text-white/60">
                Confirm your Creator Pass application
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              {/* Summary */}
              <div className="p-[1px] rounded-[22px] bg-gradient-to-br from-purple-500/20 via-purple-600/10 to-transparent relative group">
                <div className="absolute inset-0 rounded-[22px] bg-gradient-to-br from-purple-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />
                <div className="relative bg-black/60 backdrop-blur-xl rounded-[22px] p-5 border border-purple-500/10">
                  <p className="text-sm font-semibold text-purple-300 mb-3">📋 Application Summary</p>
                  <div className="space-y-2.5 text-xs">
                    <div className="flex justify-between items-center text-white/60">
                      <span>Current Pass:</span>
                      <span className={`font-semibold ${TIER_COLORS[currentTier]?.text || 'text-white'}`}>{TIER_LABELS[currentTier] || currentTier}</span>
                    </div>
                    <div className="flex justify-between items-center text-white/60">
                      <span>Upgrading To:</span>
                      <span className={`font-semibold ${TIER_COLORS.creators.text}`}>Creators Pass</span>
                    </div>
                    <div className="pt-2 border-t border-white/10">
                      <div className="space-y-2">
                        <div className="flex flex-col gap-1">
                          <span className="text-white/60">Instagram:</span>
                          <span className="text-white/90 text-[11px] break-all">{instagram}</span>
                        </div>
                        <div className="flex flex-col gap-1">
                          <span className="text-white/60">LinkedIn:</span>
                          <span className="text-white/90 text-[11px] break-all">{linkedin}</span>
                        </div>
                        {youtube && (
                          <div className="flex flex-col gap-1">
                            <span className="text-white/60">YouTube:</span>
                            <span className="text-white/90 text-[11px] break-all">{youtube}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Refund Notice for Gold→Creators */}
              {isRefund && (
                <div className="p-[1px] rounded-[22px] bg-gradient-to-br from-emerald-500/20 via-emerald-600/10 to-transparent relative group">
                  <div className="absolute inset-0 rounded-[22px] bg-gradient-to-br from-emerald-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />
                  <div className="relative bg-black/60 backdrop-blur-xl rounded-[22px] p-5 border border-emerald-500/10">
                    <div className="flex items-start gap-3">
                      <Check className="h-5 w-5 text-emerald-400 mt-0.5 flex-shrink-0" />
                      <div className="flex-1">
                        <p className="text-sm font-semibold text-emerald-300 mb-2">💚 Refund Processing</p>
                        <div className="space-y-2 text-xs text-white/80">
                          <p>Your Gold Pass payment will be refunded within <strong className="text-emerald-200">3-5 business days</strong>.</p>
                          <p>You'll receive the refund to your original payment method.</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Important Notices */}
              <div className="p-[1px] rounded-[22px] bg-gradient-to-br from-amber-500/20 via-amber-600/10 to-transparent relative group">
                <div className="absolute inset-0 rounded-[22px] bg-gradient-to-br from-amber-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />
                <div className="relative bg-black/60 backdrop-blur-xl rounded-[22px] p-5 border border-amber-500/10">
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="h-5 w-5 text-amber-400 mt-0.5 flex-shrink-0" />
                    <div className="flex-1">
                      <p className="text-sm font-semibold text-amber-300 mb-2">⚠️ Before You Submit</p>
                      <div className="space-y-2 text-xs text-white/80">
                        <div className="flex items-start gap-2">
                          <span className="text-amber-400 mt-0.5">•</span>
                          <span>This action <strong className="text-amber-200">cannot be reversed</strong> once submitted</span>
                        </div>
                        <div className="flex items-start gap-2">
                          <span className="text-amber-400 mt-0.5">•</span>
                          <span>Make sure your social profiles are <strong className="text-amber-200">public</strong> and follower counts are <strong className="text-amber-200">visible</strong></span>
                        </div>
                        <div className="flex items-start gap-2">
                          <span className="text-amber-400 mt-0.5">•</span>
                          <span>Approval requires <strong className="text-amber-200">10,000+ followers</strong> on at least one platform</span>
                        </div>
                        <div className="flex items-start gap-2">
                          <span className="text-amber-400 mt-0.5">•</span>
                          <span>If rejected, you can <strong className="text-amber-200">reapply with updated information</strong></span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* What Happens Next */}
              <div className="p-[1px] rounded-[22px] bg-gradient-to-br from-blue-500/20 via-blue-600/10 to-transparent relative group">
                <div className="absolute inset-0 rounded-[22px] bg-gradient-to-br from-blue-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />
                <div className="relative bg-black/60 backdrop-blur-xl rounded-[22px] p-5 border border-blue-500/10">
                  <p className="text-sm font-semibold text-blue-300 mb-2">🎯 What Happens Next?</p>
                  <div className="space-y-2.5 text-xs text-white/80">
                    <div className="flex items-start gap-2">
                      <Check className="h-4 w-4 text-blue-400 mt-0.5 flex-shrink-0" />
                      <span>Your application will be reviewed within <strong className="text-blue-200">48 hours</strong></span>
                    </div>
                    <div className="flex items-start gap-2">
                      <Check className="h-4 w-4 text-blue-400 mt-0.5 flex-shrink-0" />
                      <span>You'll receive an <strong className="text-blue-200">email notification</strong> about the decision</span>
                    </div>
                    <div className="flex items-start gap-2">
                      <Check className="h-4 w-4 text-blue-400 mt-0.5 flex-shrink-0" />
                      <span>Upon approval, {isRefund ? <strong className="text-blue-200">refund will be processed</strong> : <strong className="text-blue-200">you can complete payment</strong>}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <DialogFooter className="flex-col sm:flex-row gap-3 items-center sm:justify-between">
              <Button
                variant="outline"
                onClick={() => setConfirmationStep(1)}
                disabled={submitting}
                className="w-full sm:w-auto px-6 py-3 border-white/20 bg-transparent text-white hover:bg-white/5 rounded-xl font-semibold transition-all duration-200"
              >
                Go Back
              </Button>
              <div className="w-full sm:w-auto flex justify-end">
                {localApplicationStatus === 'approved' && isRefund ? (
                  <div className="flex items-center gap-2 px-6 py-3 bg-emerald-500/20 border border-emerald-500/50 rounded-xl">
                    <Check className="h-4 w-4 text-emerald-400" />
                    <span className="font-semibold text-sm text-emerald-300">Refund Processing</span>
                  </div>
                ) : (
                  <Button
                    onClick={handleFinalSubmit}
                    disabled={submitting}
                    className="px-8 py-3 bg-white text-black font-semibold rounded-xl shadow-[0_12px_40px_rgba(255,255,255,0.08)] hover:shadow-[0_16px_50px_rgba(255,255,255,0.12)] transition-all duration-300"
                  >
                    {submitting ? "Submitting..." : "Submit for Review"}
                  </Button>
                )}
              </div>
            </DialogFooter>
          </>
        )}
        </div>
      </div>
      </DialogContent>
    </Dialog>
  );
}
