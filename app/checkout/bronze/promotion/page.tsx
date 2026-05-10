"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useUser } from "@clerk/nextjs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { Instagram, Linkedin, ArrowLeft } from "lucide-react";

export default function BronzePromotionPage() {
  const router = useRouter();
  const { user, isSignedIn } = useUser();
  const { toast } = useToast();
  
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [instagramProofUrl, setInstagramProofUrl] = useState("");
  const [linkedinProofUrl, setLinkedinProofUrl] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [instagramHandle, setInstagramHandle] = useState("");
  const [linkedinProfile, setLinkedinProfile] = useState("");
  const [organization, setOrganization] = useState("");
  const [profession, setProfession] = useState("");
  const [ageGroup, setAgeGroup] = useState("");
  const [cityName, setCityName] = useState("");
  const [stateName, setStateName] = useState("");
  const [referralCode, setReferralCode] = useState("");
  const ageGroupOptions = ["13-18", "18-26", "26-34", "34-45", "45+"];

  useEffect(() => {
    if (!isSignedIn) {
      router.push("/signin?redirect_url=/checkout/bronze/promotion");
      return;
    }

    (async () => {
      try {
        if (user?.primaryEmailAddress?.emailAddress) {
          setEmail(user.primaryEmailAddress.emailAddress);
        }
        if (user?.fullName) {
          setName(user.fullName);
        }

        // Attempt to prefill details from an attendee record if it exists
        try {
          const attendeeRes = await fetch("/api/ics25/attendees");
          if (attendeeRes.status === 401) {
            router.push("/signin?redirect_url=/checkout/bronze/promotion");
            return;
          }
          if (attendeeRes.ok) {
            const attendeeData = await attendeeRes.json();
            const attendee = attendeeData?.attendee;
            if (attendee) {
              if (attendee.name) setName(attendee.name);
              if (attendee.email) setEmail(attendee.email);
              if (attendee.phone) setPhone(attendee.phone);
              if (attendee.instagram) setInstagramHandle(attendee.instagram);
              if (attendee.linkedin) setLinkedinProfile(attendee.linkedin);
              if (attendee.organization) setOrganization(attendee.organization);
              if (attendee.profession) setProfession(attendee.profession);
              if (attendee.ageGroup) setAgeGroup(attendee.ageGroup);
              if (attendee.city) setCityName(attendee.city);
              if (attendee.state) setStateName(attendee.state);
              if (attendee.referredBy?.code) setReferralCode(attendee.referredBy.code);

              if (attendee.attendeePassTier) {
                const awaitingBronzeApproval = attendee.attendeePassTier === 'bronze' && (attendee.payment?.status === 'pending' || attendee.payment?.status === 'rejected');
                if (!awaitingBronzeApproval) {
                  setLoading(false);
                  router.push("/checkout/ics25/confirmation");
                  return;
                }
              }
            }
          }
        } catch (attendeeError) {
          console.warn("Failed to load attendee record:", attendeeError);
        }

        const res = await fetch("/api/ics25/bronze-promotion");
        if (res.ok) {
          const data = await res.json();
          const bronzePromotion = data?.bronzePromotion;
          const submission = data?.submission;

          if (submission) {
            if (submission.name) setName(submission.name);
            if (submission.email) setEmail(submission.email);
            if (submission.phone) setPhone(submission.phone);
            if (submission.instagramProofUrl) setInstagramProofUrl(submission.instagramProofUrl);
            if (submission.linkedinProofUrl) setLinkedinProofUrl(submission.linkedinProofUrl);
          } else if (bronzePromotion) {
            if (bronzePromotion.instagramProofUrl) setInstagramProofUrl(bronzePromotion.instagramProofUrl);
            if (bronzePromotion.linkedinProofUrl) setLinkedinProofUrl(bronzePromotion.linkedinProofUrl);
          }

          if (bronzePromotion) {
            if (bronzePromotion.status === 'submitted') {
              setLoading(false);
              router.push("/checkout/bronze/review");
              return;
            }
            if (bronzePromotion.status === 'verified') {
              setLoading(false);
              router.push("/checkout/ics25/confirmation");
              return;
            }
            if (bronzePromotion.status === 'rejected') {
              toast({
                title: "Previous Submission Rejected",
                description: bronzePromotion.rejectionReason || "Please submit new promotion links",
                variant: "destructive" as any,
              });
            }
          }
        }

        setLoading(false);
      } catch (e: any) {
        console.error("Error loading promotion status:", e);
        setLoading(false);
      }
    })();
  }, [isSignedIn, user, router, toast]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const trimmedName = name.trim();
    const trimmedEmail = email.trim();
    const trimmedPhone = phone.trim();
    const trimmedInstagram = instagramHandle.trim();
    const trimmedLinkedin = linkedinProfile.trim();
    const trimmedProfession = profession.trim();
    const trimmedCity = cityName.trim();
    const trimmedState = stateName.trim();
    const trimmedOrganization = organization.trim();
    const normalizedReferral = referralCode.trim().toLowerCase();

    const missingFields: string[] = [];
    if (!trimmedName) missingFields.push("name");
    if (!trimmedEmail) missingFields.push("email");
    if (!trimmedPhone) missingFields.push("phone");
    if (!trimmedInstagram) missingFields.push("instagram");
    if (!trimmedLinkedin) missingFields.push("linkedin");
    if (!trimmedProfession) missingFields.push("profession");
    if (!ageGroup) missingFields.push("age group");
    if (!trimmedCity) missingFields.push("city");
    if (!trimmedState) missingFields.push("state");

    if (missingFields.length > 0) {
      toast({
        title: "Missing Information",
        description: `Please provide: ${missingFields.join(", ")}`,
        variant: "destructive" as any,
      });
      return;
    }

    // Require at least one link (Instagram or LinkedIn)
    if (!instagramProofUrl && !linkedinProofUrl) {
      toast({
        title: "Missing Link",
        description: "Please provide at least one promotion link (Instagram or LinkedIn)",
        variant: "destructive" as any,
      });
      return;
    }

    try {
      setSubmitting(true);

      const payload: Record<string, any> = {
        instagramProofUrl: instagramProofUrl || undefined,
        linkedinProofUrl: linkedinProofUrl || undefined,
        name: trimmedName,
        email: trimmedEmail,
        phone: trimmedPhone,
        instagram: trimmedInstagram,
        linkedin: trimmedLinkedin,
        profession: trimmedProfession,
        ageGroup,
        city: trimmedCity,
        state: trimmedState,
      };

      if (trimmedOrganization) {
        payload.organization = trimmedOrganization;
      }

      if (normalizedReferral) {
        payload.referralCode = normalizedReferral;
      }

      const res = await fetch("/api/ics25/bronze-promotion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok || !data.ok) {
        throw new Error(data?.message || "Failed to submit promotion");
      }

      toast({
        title: "Details Submitted!",
        description: "We'll review your submission within 48 hours",
      });

      router.push("/checkout/bronze/review");
    } catch (e: any) {
      toast({
        title: "Submission Failed",
        description: e?.message || "Something went wrong. Please try again.",
        variant: "destructive" as any,
      });
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-white dark:bg-zinc-950">
        <Navbar />
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="text-zinc-900 dark:text-zinc-100">Loading...</div>
        </div>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white dark:bg-zinc-950">
      <Navbar />
      
      <main className="max-w-3xl mx-auto px-4 py-16">
        <button
          onClick={() => router.push("/checkout")}
          className="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 mb-6"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Checkout
        </button>

        <div className="relative">
          <div aria-hidden className="pointer-events-none absolute -inset-2 rounded-[32px] bg-gradient-to-br from-amber-600/12 via-transparent to-amber-800/12 blur-2xl" />
          
          <div className="relative rounded-3xl border border-white/10 bg-white/60 dark:bg-zinc-950/60 backdrop-blur-xl p-8">
            <div className="mb-6">
              <h1 className="text-[32px] font-bold text-zinc-900 dark:text-zinc-100 mb-2">
                Silver Pass - Promotion Tasks
              </h1>
              <p className="text-zinc-600 dark:text-zinc-400">
                Complete <strong>at least one</strong> of the following tasks to unlock your free Silver Pass for ICS'25.
              </p>
            </div>

            {/* Task Instructions */}
            <div className="mb-8 space-y-4">
              <div className="rounded-2xl border border-amber-600/30 bg-amber-500/10 p-4">
                <div className="flex items-start gap-3">
                  <Instagram className="w-6 h-6 text-amber-600 flex-shrink-0 mt-1" />
                  <div>
                    <h3 className="font-semibold text-zinc-900 dark:text-zinc-100 mb-1">
                      Task 1: Instagram Story Promotion
                    </h3>
                    <p className="text-sm text-zinc-600 dark:text-zinc-400 mb-2">
                      Post an Instagram story promoting ICS'25 and tag <strong>@insturix</strong>
                    </p>
                    <p className="text-[11px] text-zinc-500 dark:text-zinc-500">
                      Include event details and your excitement about attending!
                    </p>
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-blue-600/30 bg-blue-500/10 p-4">
                <div className="flex items-start gap-3">
                  <Linkedin className="w-6 h-6 text-blue-600 flex-shrink-0 mt-1" />
                  <div>
                    <h3 className="font-semibold text-zinc-900 dark:text-zinc-100 mb-1">
                      Task 2: LinkedIn Post
                    </h3>
                    <p className="text-sm text-zinc-600 dark:text-zinc-400 mb-2">
                      Share a LinkedIn post about ICS'25 and tag <strong>Insturix</strong>
                    </p>
                    <p className="text-[11px] text-zinc-500 dark:text-zinc-500">
                      Share why you're attending and what you're looking forward to!
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Submission Form */}
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="name">Full Name *</Label>
                  <Input
                    id="name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Your name"
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="email">Email *</Label>
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    required
                    disabled
                  />
                </div>
                <div className="md:col-span-2">
                  <Label htmlFor="phone">Phone Number *</Label>
                  <Input
                    id="phone"
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="10-digit number"
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="instagram-handle">Instagram *</Label>
                  <Input
                    id="instagram-handle"
                    value={instagramHandle}
                    onChange={(e) => setInstagramHandle(e.target.value)}
                    placeholder="@username or profile URL"
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="linkedin-profile">LinkedIn *</Label>
                  <Input
                    id="linkedin-profile"
                    value={linkedinProfile}
                    onChange={(e) => setLinkedinProfile(e.target.value)}
                    placeholder="Profile URL"
                    required
                  />
                </div>
                <div className="md:col-span-2">
                  <Label htmlFor="organization">School / Institution / Company (optional)</Label>
                  <Input
                    id="organization"
                    value={organization}
                    onChange={(e) => setOrganization(e.target.value)}
                    placeholder="Name (if applicable)"
                  />
                </div>
                <div>
                  <Label htmlFor="profession">Profession *</Label>
                  <Input
                    id="profession"
                    value={profession}
                    onChange={(e) => setProfession(e.target.value)}
                    placeholder="Student, Engineer, Creator, etc."
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="age-group">Age Group *</Label>
                  <Select value={ageGroup} onValueChange={setAgeGroup}>
                    <SelectTrigger id="age-group" className="w-full">
                      <SelectValue placeholder="Select age group" />
                    </SelectTrigger>
                    <SelectContent>
                      {ageGroupOptions.map((option) => (
                        <SelectItem key={option} value={option}>
                          {option}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="city">City *</Label>
                  <Input
                    id="city"
                    value={cityName}
                    onChange={(e) => setCityName(e.target.value)}
                    placeholder="City"
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="state">State *</Label>
                  <Input
                    id="state"
                    value={stateName}
                    onChange={(e) => setStateName(e.target.value)}
                    placeholder="State"
                    required
                  />
                </div>
                <div className="md:col-span-2">
                  <Label htmlFor="referral">Referral Code (optional)</Label>
                  <Input
                    id="referral"
                    value={referralCode}
                    onChange={(e) => setReferralCode(e.target.value)}
                    placeholder="Have a friend’s code?"
                  />
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <Label htmlFor="instagram">Instagram Story Link (optional)</Label>
                  <Input
                    id="instagram"
                    type="url"
                    value={instagramProofUrl}
                    onChange={(e) => setInstagramProofUrl(e.target.value)}
                    placeholder="https://instagram.com/stories/..."
                    required={false}
                  />
                  <p className="mt-1 text-[11px] text-zinc-500 dark:text-zinc-500">
                    Paste the link to your Instagram story (it should be public or saved to highlights)
                  </p>
                </div>

                <div>
                  <Label htmlFor="linkedin">LinkedIn Post Link (optional)</Label>
                  <Input
                    id="linkedin"
                    type="url"
                    value={linkedinProofUrl}
                    onChange={(e) => setLinkedinProofUrl(e.target.value)}
                    placeholder="https://linkedin.com/posts/..."
                    required={false}
                  />
                  <p className="mt-1 text-[11px] text-zinc-500 dark:text-zinc-500">
                    Paste the link to your LinkedIn post
                  </p>
                </div>
              </div>

              <div className="rounded-lg bg-zinc-100 dark:bg-zinc-800/50 p-4">
                <h4 className="font-medium text-zinc-900 dark:text-zinc-100 mb-2">
                  What happens next?
                </h4>
                <ul className="text-sm text-zinc-600 dark:text-zinc-400 space-y-1">
                  <li>• We'll review your submissions within 48 hours</li>
                  <li>• Once approved, your Bronze Pass registration will be confirmed automatically</li>
                  <li>• You'll receive a confirmation email</li>
                </ul>
              </div>

              <Button
                type="submit"
                disabled={submitting}
                className="w-full bg-amber-600 hover:bg-amber-700 text-white font-semibold rounded-xl"
              >
                {submitting ? "Submitting..." : "Submit for Review"}
              </Button>

              <p className="text-[11px] text-center text-zinc-500">
                By submitting, you confirm you've completed at least one of the promotional tasks.
              </p>
            </form>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
