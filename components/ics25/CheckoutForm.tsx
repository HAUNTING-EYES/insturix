"use client";

import { useEffect, useMemo, useState, useRef } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar, Check, ChevronsUpDown } from "lucide-react";
import { GetCountries, GetState, GetCity } from "react-country-state-city";
import { useUser, useAuth } from "@clerk/nextjs";

type Tier = "bronze" | "silver" | "gold" | "creators";

const TIER_PRICING: Record<Tier, { label: string; amount: number; currency: "INR"; perks: string[]; cta?: string; subtitle?: string }> = {
  bronze: { label: "Bronze", amount: 0, currency: "INR", perks: ["Access to panel talks", "Access to speaker sessions", "Audience Access to Creator Awards", "DJ night access"], cta: "Register" },
  silver: { label: "Silver", amount: 2500, currency: "INR", perks: ["Everything in Bronze Pass", "Participate in Reel making showdown", "Speed Edits", "Access to quite rooms and Gaming Zones", "Standup Show"] },
  gold: { label: "Gold", amount: 5000, currency: "INR", perks: ["Everything in Silver Pass", "Networking lounge", "Lunch both days", "Free merch", "1 yr Insturix Pro Subscription"] },
  creators: { label: "Creators", amount: 3000, currency: "INR", perks: ["Everything in Gold Pass", "Priority Access", "Brand Shoutout", "Featuring on Banner"], subtitle: "Validity: 10k+ followers Instagram/YouTube/LinkedIn" },
};

declare global {
  interface Window {
    Razorpay: any;
  }
}

export default function CheckoutForm() {
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const router = useRouter();
  const { user } = useUser();
  const { isSignedIn } = useAuth();
  const [loading, setLoading] = useState(true);
  const [me, setMe] = useState<any | null>(null);
  const hasCheckedRef = useRef(false);

  // Basic profile details for the badge and receipt
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [instagram, setInstagram] = useState("");
  const [linkedin, setLinkedin] = useState("");
  const [youtube, setYoutube] = useState("");
  const [organization, setOrganization] = useState("");
  const [profession, setProfession] = useState("");
  const [ageGroup, setAgeGroup] = useState<string>("");
  const [cityName, setCityName] = useState("");
  const [stateName, setStateName] = useState("");

  const [tier, setTier] = useState<Tier>("silver");
  const [referralCode, setReferralCode] = useState<string>("");
  const [creatingOrder, setCreatingOrder] = useState(false);
  const [creatorApprovalStatus, setCreatorApprovalStatus] = useState<string | null>(null);
  const [bronzePromotionStatus, setBronzePromotionStatus] = useState<string | null>(null);
  const [bronzeRejectionReason, setBronzeRejectionReason] = useState<string | null>(null);
  const [bronzeInstagramUrl, setBronzeInstagramUrl] = useState<string>("");
  const [bronzeLinkedinUrl, setBronzeLinkedinUrl] = useState<string>("");
  const [bronzeSubmitting, setBronzeSubmitting] = useState<boolean>(false);

  const [states, setStates] = useState<any[]>([]);
  const [cities, setCities] = useState<any[]>([]);
  const [countryId, setCountryId] = useState<number | null>(101);
  const [stateId, setStateId] = useState<number | null>(null);
  const [cityId, setCityId] = useState<number | null>(null);
  const [stateOpen, setStateOpen] = useState(false);
  const [cityOpen, setCityOpen] = useState(false);

  useEffect(() => {
    // Preselect tier from query
    const q = (searchParams?.get("tier") || "").toLowerCase();
    if (q === "bronze" || q === "silver" || q === "gold" || q === "creators") {
      setTier(q);
    }
  }, [searchParams]);

  useEffect(() => {
    // Prevent running multiple times
    if (hasCheckedRef.current) return;
    if (!user) return;
    
    hasCheckedRef.current = true;

    (async () => {
      try {
        // Keep loading true while checking
        
        // Set email from Clerk authentication
        if (user?.primaryEmailAddress?.emailAddress) {
          setEmail(user.primaryEmailAddress.emailAddress);
        }
        
        // Helper: try to match state/city names to IDs immediately (avoid ordering issues)
        const matchStateCityFromNames = async (incomingState?: string | null, incomingCity?: string | null) => {
          try {
            if (!incomingState && !incomingCity) return;
            if (!countryId) return;

            // Fetch all states for the country
            const allStates = await GetState(countryId);
            // Keep states list updated
            if (allStates && allStates.length > 0) setStates(allStates);

            if (incomingState && allStates.length > 0) {
              const desired = (incomingState || "").trim().toLowerCase();
              let foundState = allStates.find((s: any) => (s.name || "").trim().toLowerCase() === desired);
              if (!foundState) {
                foundState = allStates.find((s: any) => ((s.name || "").trim().toLowerCase()).includes(desired));
              }

              if (foundState) {
                setStateId(foundState.id);
                setStateName(foundState.name || incomingState || "");

                // Fetch cities for this state and populate list
                const allCities = await GetCity(countryId, foundState.id);
                setCities(allCities || []);

                if (incomingCity && allCities && allCities.length > 0) {
                  const normalize = (s: string) => (s || "").replace(/[^a-z0-9]/gi, '').trim().toLowerCase();
                  const desiredCityNorm = normalize(incomingCity);
                  let foundCity = allCities.find((c: any) => normalize(c.name) === desiredCityNorm);
                  if (!foundCity) {
                    foundCity = allCities.find((c: any) => normalize(c.name).includes(desiredCityNorm) || desiredCityNorm.includes(normalize(c.name)));
                  }

                  // Fallback: token overlap (split words and check intersection)
                  if (!foundCity) {
                    const desiredTokens = (incomingCity || "").toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
                    let bestMatch: any = null;
                    let bestScore = 0;
                    for (const c of allCities) {
                      const tokens = (c.name || "").toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
                      const common = tokens.filter((t: string) => desiredTokens.includes(t));
                      if (common.length > bestScore) {
                        bestScore = common.length;
                        bestMatch = c;
                      }
                    }
                    // Accept best match if we have some overlap OR incoming city has reasonable length
                    if (bestMatch && (bestScore >= 1 || (desiredCityNorm && desiredCityNorm.length >= 3))) {
                      foundCity = bestMatch;
                    }
                  }
                  // Final fallback: longest common substring heuristic
                  if (!foundCity) {
                    const a = (incomingCity || "").toLowerCase();
                    let bestCity: any = null;
                    let bestLen = 0;
                    const lcsLen = (s1: string, s2: string) => {
                      const n = s1.length, m = s2.length;
                      if (!n || !m) return 0;
                      // dynamic programming table
                      const dp: number[] = new Array(m+1).fill(0);
                      let max = 0;
                      for (let i=1;i<=n;i++){
                        for (let j=m;j>=1;j--){
                          if (s1[i-1] === s2[j-1]) {
                            dp[j] = dp[j-1] + 1;
                            if (dp[j] > max) max = dp[j];
                          } else {
                            dp[j] = 0;
                          }
                        }
                      }
                      return max;
                    };
                    for (const c of allCities) {
                      const name = (c.name || "").toLowerCase();
                      const len = lcsLen(a, name);
                      if (len > bestLen) {
                        bestLen = len;
                        bestCity = c;
                      }
                    }
                    if (bestCity && bestLen >= 3) {
                      foundCity = bestCity;
                    }
                  }

                  if (foundCity) {
                    setCityId(foundCity.id);
                    setCityName(foundCity.name || incomingCity || "");
                  }
                }
              }
            }
          } catch (e) {
            // swallow; non-critical
            console.debug('matchStateCityFromNames failed', e);
          }
        };

        // Check if user is already registered as attendee
        const attendeeRes = await fetch("/api/ics25/attendees", { headers: { accept: "application/json" } });
        if (attendeeRes.ok) {
          const attendeeData = await attendeeRes.json();
          const att = attendeeData?.attendee;
          
          if (att) {
            // Check if user has paid pass - redirect to confirmation page
            if (att.attendeePassTier && att.payment?.status === 'paid') {
              router.push("/checkout/ics25/confirmation");
              return; // Keep loading true, don't show form
            }
            
            // Pre-fill form with existing attendee data (for non-creator tiers)
            if (att.attendeePassTier !== 'creators') {
              setName(att.name || "");
              setPhone(att.phone || "");
              setInstagram(att.instagram || "");
              setLinkedin(att.linkedin || "");
              setOrganization(att.organization || "");
              setProfession(att.profession || "");
              setAgeGroup(att.ageGroup || "");
              setCityName(att.city || "");
              setStateName(att.state || "");
              // Immediately try to resolve IDs from these names
              await matchStateCityFromNames(att.state || null, att.city || null);
            }
          }
        }
        
        // Check creator application status for any user (they might have applied before)
        const creatorRes = await fetch("/api/ics25/creator-approval", { headers: { accept: "application/json" } });
        if (creatorRes.ok) {
          const creatorData = await creatorRes.json();
          const creator = creatorData?.creator;
          
          if (creator) {
            const status = creator.status;
            setCreatorApprovalStatus(status);
            
            // Pre-fill form with creator data
            setName(creator.name || "");
            setPhone(creator.phone || "");
            setInstagram(creator.instagram || "");
            setLinkedin(creator.linkedin || "");
            setYoutube(creator.socialLinks?.youtube || "");
            setOrganization(creator.organization || "");
            setProfession(creator.profession || "");
            setAgeGroup(creator.ageGroup || "");
            setCityName(creator.city || "");
            setStateName(creator.state || "");

            // Immediately try to resolve IDs for creator data too
            await matchStateCityFromNames(creator.state || null, creator.city || null);
            
            // Show form for all statuses (pending/approved/rejected)
            // Each status will show appropriate banner/message
          }
        }

        // Check bronze promotion status
        const bronzeRes = await fetch("/api/ics25/bronze-promotion", { headers: { accept: "application/json" } });
        if (bronzeRes.ok) {
          const bronzeData = await bronzeRes.json();
          const bronzePromotion = bronzeData?.bronzePromotion;

          if (bronzePromotion) {
            setBronzePromotionStatus(bronzePromotion.status || 'none');
            setBronzeRejectionReason(bronzePromotion.rejectionReason || null);
            if (bronzePromotion.instagramProofUrl) setBronzeInstagramUrl(bronzePromotion.instagramProofUrl);
            if (bronzePromotion.linkedinProofUrl) setBronzeLinkedinUrl(bronzePromotion.linkedinProofUrl);
          } else {
            setBronzePromotionStatus('none');
            setBronzeRejectionReason(null);
          }
        }
        
        if (attendeeRes.status === 401) {
          router.push("/signin?redirect_url=/checkout");
          return; // Don't set loading false
        }
        
        // Only set loading to false if we're not redirecting
        setLoading(false);
      } catch (e: any) {
        toast({ title: "Failed to load", description: e?.message || "Could not load your profile.", variant: "destructive" as any });
        setLoading(false);
      }
    })();
  }, [user, tier, toast, router]);

  useEffect(() => {
    (async () => {
      if (countryId) {
        const states = await GetState(countryId);
        setStates(states);
        
        // If we have a stateName from loaded data, find its ID (case-insensitive, trimmed)
        if (stateName && states.length > 0) {
          const desired = stateName.trim().toLowerCase();
          let matchingState = states.find((s: any) => (s.name || "").trim().toLowerCase() === desired);
          // Fallback: try relaxed match (contains)
          if (!matchingState) {
            matchingState = states.find((s: any) => ((s.name || "").trim().toLowerCase()).includes(desired));
          }
          if (matchingState) {
            setStateId(matchingState.id);
            // Use canonical state name from provider to avoid small mismatches
            setStateName(matchingState.name || stateName);
          }
        }
      } else {
        setStates([]);
        setStateId(null);
        setStateName("");
        setCities([]);
        setCityId(null);
        setCityName("");
      }
    })();
  }, [countryId, stateName]);

  useEffect(() => {
    (async () => {
      if (stateId && countryId) {
        const cities = await GetCity(countryId, stateId);
        setCities(cities);
        
        // If we have a cityName from loaded data, find its ID (case-insensitive, trimmed)
        if (cityName && cities.length > 0) {
          const desiredCity = cityName.trim().toLowerCase();
          let matchingCity = cities.find((c: any) => (c.name || "").trim().toLowerCase() === desiredCity);
          // Fallback: normalized includes (remove punctuation/spaces)
          if (!matchingCity) {
            const normalize = (s: string) => (s || "").replace(/[^a-z0-9]/gi, '').trim().toLowerCase();
            const desiredNorm = normalize(cityName);
            matchingCity = cities.find((c: any) => normalize(c.name) === desiredNorm || normalize(c.name).includes(desiredNorm) || desiredNorm.includes(normalize(c.name)));
          }
          if (matchingCity) {
            setCityId(matchingCity.id);
            // Use canonical city name from provider
            setCityName(matchingCity.name || cityName);
          }
        }
      } else {
        setCities([]);
        setCityId(null);
        setCityName("");
      }
    })();
  }, [stateId, countryId, cityName]);

  // Redirect to home page if user logs out
  useEffect(() => {
    if (isSignedIn === false) {
      router.push("/");
    }
  }, [isSignedIn, router]);

  const pricing = useMemo(() => TIER_PRICING[tier], [tier]);

  // Check creator application status flags
  const isApprovedCreator = tier === 'creators' && creatorApprovalStatus === 'approved';
  const isRejectedCreator = creatorApprovalStatus === 'rejected';
  const isPendingCreator = tier === 'creators' && creatorApprovalStatus === 'pending';

  const canPay = useMemo(() => {
    // Require consistent details for all tiers to align with backend API
    const basicOk = !!name.trim() && !!email.trim() && !!phone.trim();
    const socialsOk = !!instagram.trim() && !!linkedin.trim(); // Instagram and LinkedIn required
    const addressOk = !!cityName.trim() && !!stateName.trim();
    const demoOk = !!ageGroup; // age group required
    const proOk = !!profession.trim(); // profession required
    
    // For creators, also require at least one social link (youtube/instagram/linkedin)
    if (tier === 'creators') {
      const creatorSocialOk = !!youtube.trim() || !!instagram.trim() || !!linkedin.trim();
      return basicOk && socialsOk && addressOk && demoOk && proOk && creatorSocialOk;
    }
    // For bronze, only allow registration after promotion is verified
    if (tier === 'bronze') {
      const promoOk = bronzePromotionStatus === 'verified';
      return promoOk && basicOk && socialsOk && addressOk && demoOk && proOk;
    }
    
    return basicOk && socialsOk && addressOk && demoOk && proOk;
  }, [name, email, phone, instagram, linkedin, youtube, cityName, stateName, ageGroup, profession, tier, bronzePromotionStatus]);

  // Auto-poll bronze status while under review
  useEffect(() => {
    if (tier !== 'bronze' || bronzePromotionStatus !== 'submitted') return;
    let mounted = true;
    const interval = setInterval(async () => {
      try {
        const r = await fetch('/api/ics25/bronze-promotion', { headers: { accept: 'application/json' } });
        if (!r.ok) return;
        const d = await r.json();
        const bp = d?.bronzePromotion;
        if (!mounted) return;
        if (bp) {
          setBronzePromotionStatus(bp.status || 'none');
          setBronzeRejectionReason(bp.rejectionReason || null);
        }
      } catch {}
    }, 30000);
    return () => { mounted = false; clearInterval(interval); };
  }, [tier, bronzePromotionStatus]);

  const submitBronzePromotion = async () => {
    // Validate URLs
    if (!/^https?:\/\//i.test(bronzeInstagramUrl) || !/^https?:\/\//i.test(bronzeLinkedinUrl)) {
      toast({ title: 'Invalid links', description: 'Please paste valid public URLs for Instagram and LinkedIn.', variant: 'destructive' as any });
      return;
    }
    try {
      setBronzeSubmitting(true);
      const r = await fetch('/api/ics25/bronze-promotion', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ instagramProofUrl: bronzeInstagramUrl, linkedinProofUrl: bronzeLinkedinUrl })
      });
      const d = await r.json();
      if (!r.ok || d?.ok === false) throw new Error(d?.message || 'Submission failed');
      toast({ title: 'Submitted', description: 'We will review your promotion within 48 hours.' });
      // Set status to submitted immediately
      setBronzePromotionStatus('submitted');
      setBronzeRejectionReason(null);
    } catch (e: any) {
      toast({ title: 'Submission error', description: e?.message || 'Try again later', variant: 'destructive' as any });
    } finally {
      setBronzeSubmitting(false);
    }
  };

  const handleUpsertProfile = async () => {
    // Upsert attendee profile with all required details
    const body: any = {
      name,
      email,
      phone,
      instagram,
      linkedin,
      organization,
      profession,
      ageGroup,
      city: cityName,
      state: stateName,
      attendeePassTier: tier,
    };
    try {
      const r = await fetch("/api/ics25/attendees", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const d = await r.json();
      if (!r.ok) {
        throw new Error(d?.message || d?.error || "Could not save profile");
      }
      return d;
    } catch (e: any) {
      console.error('handleUpsertProfile error:', e);
      throw e;
    }
  };

  const openRazorpay = (opts: { orderId: string; amount: number; currency: string; key?: string }) => {
    const { orderId, amount, currency, key } = opts;
    const rzp = new window.Razorpay({
      key,
      amount,
      currency,
      name: "Insturix",
  description: `${pricing.label} Attendee Pass`,
      order_id: orderId,
      prefill: { name, email },
      theme: { color: "#3A9EFF" },
      modal: { ondismiss: () => setCreatingOrder(false) },
      handler: async (response: any) => {
        try {
          const vr = await fetch("/api/ics25/payments/verify", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ orderId: response.razorpay_order_id, paymentId: response.razorpay_payment_id, signature: response.razorpay_signature })
          });
          const vd = await vr.json();
          if (vr.ok && vd.ok) {
            toast({ title: "Payment successful", description: "Your pass has been booked. See you at ICS'25!" });
            router.push("/checkout/ics25/confirmation");
          } else {
            toast({ title: "Verification failed", description: vd?.message || "We couldn't verify your payment. If charged, contact support.", variant: "destructive" as any });
          }
        } catch (e: any) {
          toast({ title: "Verification error", description: e?.message || "Something went wrong.", variant: "destructive" as any });
        } finally {
          setCreatingOrder(false);
        }
      },
    });
    rzp.open();
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    // If Bronze tier and promotion isn't verified yet, allow submitting the promotion
    // before running the full-form validation. This prevents the "Missing info"
    // toast when users are only submitting their promotion links.
    if (tier === 'bronze' && bronzePromotionStatus !== 'verified') {
      await submitBronzePromotion();
      return;
    }

    if (!canPay) {
      const missingMsg = tier === 'creators'
        ? "Please fill all required fields including at least one social media link (YouTube, Instagram, or LinkedIn)."
        : "Please fill all required fields: name, email, mobile, Instagram, LinkedIn, profession, age group, and location (city & state).";
      toast({ title: "Missing info", description: missingMsg, variant: "destructive" as any });
      return;
    }

    try {
      setCreatingOrder(true);

      // For Creator Pass, submit for review if not yet approved
      if (tier === 'creators' && creatorApprovalStatus !== 'approved') {
        // Submit creator application with all details
        const creatorRes = await fetch("/api/ics25/creator-approval", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            youtube: youtube.trim(),
            instagram: instagram.trim(),
            linkedin: linkedin.trim(),
            name: name.trim(),
            email: email.trim(),
            phone: phone.trim(),
            organization: organization.trim(),
            profession: profession.trim(),
            ageGroup,
            city: cityName.trim(),
            state: stateName.trim(),
          }),
        });
        
        const creatorData = await creatorRes.json();
        if (!creatorRes.ok) {
          throw new Error(creatorData?.message || "Failed to submit application");
        }
        
        toast({ 
          title: "Application Submitted!", 
          description: "Your Creator Pass application is under review. We'll notify you within 24-48 hours." 
        });
        
        // Redirect to review page
        router.push("/checkout/creator/review");
        return;
      }
      
      // For other tiers or approved creators, proceed with registration
      await handleUpsertProfile();

      if (tier === "bronze") {
        toast({ title: "Registered", description: "You're registered for ICS'25. Bronze access confirmed." });
        router.push("/checkout/ics25/confirmation");
        return;
      }

      // Create Razorpay order via existing ICS payment API
      const r = await fetch("/api/ics25/payments/create-order", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ amount: pricing.amount, currency: pricing.currency, referralCode: referralCode || undefined })
      });
      const d = await r.json();
      if (!r.ok || !d.ok) throw new Error(d?.message || "Failed to create order");

      // Ensure Razorpay script present
      if (typeof window !== "undefined" && !window.Razorpay) {
        await new Promise<void>((resolve, reject) => {
          const s = document.createElement("script");
          s.src = "https://checkout.razorpay.com/v1/checkout.js";
          s.onload = () => resolve();
          s.onerror = () => reject(new Error("Failed to load Razorpay"));
          document.body.appendChild(s);
        });
      }

      openRazorpay({ orderId: d.orderId, amount: d.amount, currency: d.currency, key: d.key });
    } catch (e: any) {
      toast({ title: "Checkout error", description: e?.message || "Something went wrong.", variant: "destructive" as any });
      setCreatingOrder(false);
    }
  };

  if (loading) {
    return (
      <div className="relative">
        <div aria-hidden className="pointer-events-none absolute -inset-2 rounded-[32px] bg-gradient-to-br from-[#3A9EFF]/12 via-transparent to-[#FF2EE6]/12 blur-2xl" />
        <div className="relative rounded-3xl border border-white/10 bg-white/60 dark:bg-zinc-950/60 backdrop-blur-xl p-6">
          <div className="animate-pulse space-y-6">
            <div className="h-8 bg-zinc-200 dark:bg-zinc-800 rounded-lg w-1/3"></div>
            <div className="space-y-4">
              <div className="h-12 bg-zinc-200 dark:bg-zinc-800 rounded-lg"></div>
              <div className="h-12 bg-zinc-200 dark:bg-zinc-800 rounded-lg"></div>
              <div className="h-12 bg-zinc-200 dark:bg-zinc-800 rounded-lg"></div>
              <div className="h-12 bg-zinc-200 dark:bg-zinc-800 rounded-lg"></div>
            </div>
            <div className="h-12 bg-zinc-200 dark:bg-zinc-800 rounded-lg w-full"></div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative">
      <div aria-hidden className="pointer-events-none absolute -inset-2 rounded-[32px] bg-gradient-to-br from-[#3A9EFF]/12 via-transparent to-[#FF2EE6]/12 blur-2xl" />
      <form onSubmit={onSubmit} className="relative rounded-3xl border border-white/10 bg-white/60 dark:bg-zinc-950/60 backdrop-blur-xl p-6">
        {/* Pending Review Banner */}
        {isPendingCreator && (
          <div className="mb-6 p-4 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
            <div className="flex items-start gap-3">
              <svg className="w-6 h-6 text-yellow-600 dark:text-yellow-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div className="flex-1">
                <h3 className="font-semibold text-yellow-600 dark:text-yellow-400 mb-1">Creator Pass Application Under Review</h3>
                <p className="text-sm text-zinc-700 dark:text-zinc-300 mb-2">
                  Your Creator Pass application is currently being reviewed by our team. You'll be notified once it's approved. In the meantime, you can select a different pass tier if you'd prefer not to wait.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setTier('silver');
                  }}
                  className="text-sm font-medium text-yellow-600 dark:text-yellow-400 hover:underline"
                >
                  Choose Another Pass →
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Rejection Banner */}
        {isRejectedCreator && (
          <div className="mb-6 p-4 rounded-lg bg-red-500/10 border border-red-500/20">
            <div className="flex items-start gap-3">
              <svg className="w-6 h-6 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <div className="flex-1">
                <h3 className="font-semibold text-red-600 dark:text-red-400 mb-1">Creator Pass Application Rejected</h3>
                <p className="text-sm text-zinc-700 dark:text-zinc-300 mb-2">
                  Your application did not meet the eligibility criteria. You can reapply with updated information or choose from our other attendee pass options.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setCreatorApprovalStatus(null);
                    setTier('silver');
                  }}
                  className="text-sm font-medium text-red-600 dark:text-red-400 hover:underline"
                >
                  Choose Another Pass →
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Bronze Approved Banner */}
        {tier === 'bronze' && bronzePromotionStatus === 'verified' && (
          <div className="mb-6 p-4 rounded-lg bg-green-500/10 border border-green-500/20">
            <div className="flex items-start gap-3">
              <svg className="w-6 h-6 text-green-600 dark:text-green-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div className="flex-1">
                <h3 className="font-semibold text-green-600 dark:text-green-400 mb-1">Bronze Promotion Approved</h3>
                <p className="text-sm text-zinc-700 dark:text-zinc-300">
                  You’re approved! Please fill in your details below and click “Register Free” to complete your Bronze pass registration.
                </p>
              </div>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="md:col-span-2 space-y-6">
            <div>
              <Label>Pass Tier</Label>
              <div className="mt-2 grid grid-cols-2 gap-3">
                {(["bronze","silver","gold","creators"] as Tier[]).map((t) => {
                  const getSelectedStyles = (tierName: string) => {
                    switch (tierName) {
                      case "bronze":
                        return { border: "border-amber-600", bg: "bg-amber-600/10" };
                      case "silver":
                        return { border: "border-gray-400", bg: "bg-gray-400/10" };
                      case "gold":
                        return { border: "border-yellow-500", bg: "bg-yellow-500/10" };
                      case "creators":
                        return { border: "border-red-500", bg: "bg-red-500/10" };
                      default:
                        return { border: "border-[#3A9EFF]", bg: "bg-[#3A9EFF]/10" };
                    }
                  };
                  const selectedStyles = getSelectedStyles(t);
                  return (
                    <button
                      type="button"
                      key={t}
                      onClick={() => setTier(t)}
                      className={`rounded-xl border px-4 py-3 text-left transition ${tier===t?`${selectedStyles.border} ${selectedStyles.bg}`:"border-white/10 hover:bg-white/5"}`}
                    >
                      <div className="font-semibold">{TIER_PRICING[t].label}</div>
                      <div className="text-sm text-zinc-500 dark:text-zinc-400">{t==="bronze"?"Free":`₹${TIER_PRICING[t].amount}`}</div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Bronze promotion pre-approval block */}
            {tier === 'bronze' && bronzePromotionStatus !== 'verified' && (
              <div className="space-y-4">
                {bronzePromotionStatus === 'rejected' && (
                  <div className="rounded-lg border border-red-600/30 bg-red-500/10 text-red-300 px-3 py-2 text-sm">
                    Submission rejected{bronzeRejectionReason ? `: ${bronzeRejectionReason}` : ''}. Please fix and resubmit.
                  </div>
                )}
                {bronzePromotionStatus === 'submitted' && (
                  <div className="rounded-lg border border-amber-600/30 bg-amber-500/10 text-amber-300 px-3 py-2 text-sm">
                    Under review — we’ll verify your links within 48 hours.
                  </div>
                )}
                <div>
                  <Label htmlFor="bronze-instagram">Instagram story/post link</Label>
                  <Input id="bronze-instagram" value={bronzeInstagramUrl} onChange={(e)=>setBronzeInstagramUrl(e.target.value)} placeholder="https://instagram.com/..." disabled={bronzePromotionStatus === 'submitted'} />
                </div>
                <div>
                  <Label htmlFor="bronze-linkedin">LinkedIn post link</Label>
                  <Input id="bronze-linkedin" value={bronzeLinkedinUrl} onChange={(e)=>setBronzeLinkedinUrl(e.target.value)} placeholder="https://linkedin.com/posts/..." disabled={bronzePromotionStatus === 'submitted'} />
                </div>
              </div>
            )}

            {/* Main registration fields (hidden for Bronze until approved) */}
            {(tier !== 'bronze' || bronzePromotionStatus === 'verified') && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="name">Full name</Label>
                <Input id="name" value={name} onChange={(e)=>setName(e.target.value)} placeholder="Your name" required disabled={isApprovedCreator || isPendingCreator} />
              </div>
              <div>
                <Label htmlFor="email">Email</Label>
                <Input id="email" value={email} onChange={(e)=>setEmail(e.target.value)} placeholder="you@example.com" type="email" disabled />
              </div>
              <div>
                <Label htmlFor="phone">Phone</Label>
                <Input id="phone" value={phone} onChange={(e)=>setPhone(e.target.value)} placeholder="10-digit number" inputMode="numeric" required disabled={isApprovedCreator || isPendingCreator} />
              </div>
              <div>
                <Label htmlFor="instagram">Instagram</Label>
                <Input id="instagram" value={instagram} onChange={(e)=>setInstagram(e.target.value)} placeholder="@username" required disabled={isApprovedCreator || isPendingCreator} />
              </div>
              <div>
                <Label htmlFor="linkedin">LinkedIn</Label>
                <Input id="linkedin" value={linkedin} onChange={(e)=>setLinkedin(e.target.value)} placeholder="Profile URL" required disabled={isApprovedCreator || isPendingCreator} />
              </div>
              {tier === 'creators' && (
                <div>
                  <Label htmlFor="youtube">YouTube Channel (Optional for Creators)</Label>
                  <Input id="youtube" value={youtube} onChange={(e)=>setYoutube(e.target.value)} placeholder="Channel URL" disabled={isApprovedCreator || isPendingCreator} />
                </div>
              )}
              <div>
                <Label htmlFor="organization">School/Institution/Company</Label>
                <Input id="organization" value={organization} onChange={(e)=>setOrganization(e.target.value)} placeholder="Name (if any)" disabled={isApprovedCreator || isPendingCreator} />
              </div>
              <div>
                <Label htmlFor="profession">Profession</Label>
                <Input id="profession" value={profession} onChange={(e)=>setProfession(e.target.value)} placeholder="Student, Engineer, Creator, etc." required disabled={isApprovedCreator || isPendingCreator} />
              </div>
              <div>
                <Label htmlFor="age">Age group</Label>
                <Select value={ageGroup} onValueChange={setAgeGroup} disabled={isApprovedCreator || isPendingCreator}>
                  <SelectTrigger className="w-full bg-white/80 dark:bg-zinc-800/80 border-white/20 dark:border-zinc-700">
                    <Calendar className="w-4 h-4 mr-2 text-muted-foreground" />
                    <SelectValue placeholder="Select age group" />
                  </SelectTrigger>
                  <SelectContent className="bg-white/95 dark:bg-zinc-800/95 backdrop-blur-sm border-white/20 dark:border-zinc-700">
                    <SelectItem value="13-18" className="hover:bg-zinc-100 dark:hover:bg-zinc-700">13-18</SelectItem>
                    <SelectItem value="18-26" className="hover:bg-zinc-100 dark:hover:bg-zinc-700">18-26</SelectItem>
                    <SelectItem value="26-34" className="hover:bg-zinc-100 dark:hover:bg-zinc-700">26-34</SelectItem>
                    <SelectItem value="34-45" className="hover:bg-zinc-100 dark:hover:bg-zinc-700">34-45</SelectItem>
                    <SelectItem value="45+" className="hover:bg-zinc-100 dark:hover:bg-zinc-700">45+</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>State</Label>
                <Popover open={stateOpen} onOpenChange={setStateOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      role="combobox"
                      aria-expanded={stateOpen}
                      className="w-full justify-between bg-white/80 dark:bg-zinc-800/80 border-white/20 dark:border-zinc-700 hover:bg-white/90 dark:hover:bg-zinc-800/90"
                      disabled={!countryId || isApprovedCreator || isPendingCreator}
                    >
                      <span className="truncate">
                        {stateId
                          ? states.find((s: any) => String(s.id) === String(stateId))?.name
                          : "Select State..."}
                      </span>
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-full p-0 bg-white/95 dark:bg-zinc-800/95 backdrop-blur-sm border-white/20 dark:border-zinc-700" align="start">
                    <Command>
                      <CommandInput placeholder="Search states..." />
                      <CommandList>
                        <CommandEmpty>No state found.</CommandEmpty>
                        <CommandGroup>
                          {states.map((s: any) => (
                            <CommandItem
                              key={s.id}
                              value={s.name}
                              onSelect={() => {
                                setStateId(s.id);
                                setStateName(s.name);
                                setStateOpen(false);
                              }}
                              className="hover:bg-zinc-100 dark:hover:bg-zinc-700"
                            >
                              <Check
                                className={`mr-2 h-4 w-4 ${
                                  String(stateId) === String(s.id) ? "opacity-100" : "opacity-0"
                                }`}
                              />
                              {s.name}
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>
              <div>
                <Label>City</Label>
                <Popover open={cityOpen} onOpenChange={setCityOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      role="combobox"
                      aria-expanded={cityOpen}
                      className="w-full justify-between bg-white/80 dark:bg-zinc-800/80 border-white/20 dark:border-zinc-700 hover:bg-white/90 dark:hover:bg-zinc-800/90"
                      disabled={!stateId || isApprovedCreator || isPendingCreator}
                    >
                      {cityId
                        ? cities.find((c: any) => String(c.id) === String(cityId))?.name
                        : "Select City..."}
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-full p-0 bg-white/95 dark:bg-zinc-800/95 backdrop-blur-sm border-white/20 dark:border-zinc-700" align="start">
                    <Command>
                      <CommandInput placeholder="Search cities..." />
                      <CommandList>
                        <CommandEmpty>No city found.</CommandEmpty>
                        <CommandGroup>
                          {cities.map((c: any) => (
                            <CommandItem
                              key={c.id}
                              value={c.name}
                              onSelect={() => {
                                setCityId(c.id);
                                setCityName(c.name);
                                setCityOpen(false);
                              }}
                              className="hover:bg-zinc-100 dark:hover:bg-zinc-700"
                            >
                              <Check
                                className={`mr-2 h-4 w-4 ${
                                  String(cityId) === String(c.id) ? "opacity-100" : "opacity-0"
                                }`}
                              />
                              {c.name}
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>
            </div>
            )}

            {(tier !== 'bronze' || bronzePromotionStatus === 'verified') && (
              <div>
                <Label htmlFor="referral">Referral code (optional)</Label>
                <Input id="referral" value={referralCode} onChange={(e)=>setReferralCode(e.target.value)} placeholder="Have a friend’s code?" />
              </div>
            )}
          </div>

          <aside className="md:col-span-1">
            <div className={`relative rounded-2xl overflow-hidden p-[1px] ${
              tier === 'gold'
                ? "bg-gradient-to-br from-yellow-400/35 via-white/20 to-yellow-600/35"
                : tier === 'bronze'
                ? "bg-gradient-to-br from-amber-600/35 via-white/20 to-amber-800/35"
                : tier === 'silver'
                ? "bg-gradient-to-br from-white/65 via-white/20 to-gray-200/85"
                : tier === 'creators'
                ? "bg-gradient-to-br from-red-500/35 via-white/20 to-red-700/35"
                : "bg-gradient-to-br from-white/15 via-white/10 to-white/15"
            }`}>
              <div className="relative rounded-[14px] border border-white/10 bg-white/50 dark:bg-zinc-900/60 p-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm text-zinc-500">Selected</div>
                  <div className="text-lg font-semibold">{pricing.label} Pass</div>
                  {pricing.subtitle && (
                    <div className="text-xs text-zinc-600 dark:text-zinc-400">{pricing.subtitle}</div>
                  )}
                </div>
                <div className="text-right">
                  {tier === "bronze" ? (
                    <div className="text-xl font-bold">Free</div>
                  ) : (
                    <div className="text-xl font-bold">₹{pricing.amount}</div>
                  )}
                  <div className="text-xs text-zinc-500">{pricing.currency}</div>
                </div>
              </div>
              <ul className="mt-4 text-sm text-zinc-600 dark:text-zinc-300 space-y-1">
                {pricing.perks.map((p) => {
                  const getBulletColor = (tierName: string) => {
                    switch (tierName) {
                      case "bronze": return "bg-amber-600";
                      case "silver": return "bg-white";
                      case "gold": return "bg-yellow-500";
                      case "creators": return "bg-red-500";
                      default: return "bg-[#3A9EFF]";
                    }
                  };
                  return (
                    <li key={p} className="flex gap-2">
                      <span className={`mt-1 inline-block size-1.5 rounded-full ${getBulletColor(tier)}`} />
                      {p}
                    </li>
                  );
                })}
              </ul>

              {tier === "creators" && creatorApprovalStatus === 'approved' && (
                <div className="mt-4 p-3 rounded-lg bg-green-500/10 border border-green-500/20">
                  <div className="flex items-center gap-2 text-green-600 dark:text-green-400 text-sm font-semibold">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    Application Approved!
                  </div>
                  <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
                    Your Creator Pass application has been approved. Complete payment to secure your pass.
                  </p>
                </div>
              )}

              <Button type="submit" disabled={
                (tier === 'bronze' && bronzePromotionStatus === 'submitted')
                || (tier !== 'bronze' && (!canPay || (tier === 'creators' && creatorApprovalStatus === 'pending'))) 
              } className={`mt-5 w-full rounded-xl font-semibold text-white ${
                tier === "bronze"
                  ? "bg-amber-600 hover:bg-amber-700"
                  : tier === "silver"
                  ? "bg-white hover:bg-gray-100 text-gray-800"
                  : tier === "gold"
                  ? "bg-yellow-500 hover:bg-yellow-600"
                  : tier === "creators"
                  ? "bg-red-500 hover:bg-red-600"
                  : "bg-[#3A9EFF] hover:bg-[#2a8be6]"
              }`}>
                {tier === "bronze"
                  ? (bronzePromotionStatus === 'submitted' 
                      ? 'In Review'
                      : (bronzePromotionStatus === 'verified' 
                          ? (creatingOrder ? 'Registering…' : 'Register Free')
                          : (bronzeSubmitting ? 'Submitting…' : 'Submit for Review')))
                  : tier === "creators" && creatorApprovalStatus === 'pending'
                  ? (creatingOrder ? "Submitting…" : "Under Review")
                  : tier === "creators" && creatorApprovalStatus !== 'approved'
                  ? (creatingOrder ? "Submitting…" : "Submit for Review")
                  : (creatingOrder ? "Processing…" : "Pay Now")}
              </Button>
              <p className="mt-2 text-[11px] text-zinc-500">By proceeding you agree to the event terms.</p>
            </div>
            </div>
          </aside>
        </div>
      </form>
    </div>
  );
}
