"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useUser } from "@clerk/nextjs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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

  useEffect(() => {
    if (!isSignedIn) {
      router.push("/signin?redirect_url=/checkout/bronze/promotion");
      return;
    }

    (async () => {
      try {
        // Get user's basic info
        if (user?.primaryEmailAddress?.emailAddress) {
          setEmail(user.primaryEmailAddress.emailAddress);
        }
        if (user?.fullName) {
          setName(user.fullName);
        }

        // Check bronze promotion status
        const res = await fetch("/api/ics25/bronze-promotion");
        if (res.ok) {
          const data = await res.json();
          const bronzePromotion = data?.bronzePromotion;
          
          if (bronzePromotion) {
            if (bronzePromotion.status === 'submitted') {
              // Already submitted, redirect to review page
              router.push("/checkout/bronze/review");
              return;
            } else if (bronzePromotion.status === 'verified') {
              // Already approved, redirect to checkout
              router.push("/checkout?tier=bronze");
              return;
            } else if (bronzePromotion.status === 'rejected') {
              // Can resubmit
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

    if (!instagramProofUrl || !linkedinProofUrl) {
      toast({
        title: "Missing Links",
        description: "Please provide both Instagram and LinkedIn promotion links",
        variant: "destructive" as any,
      });
      return;
    }

    if (!name || !email || !phone) {
      toast({
        title: "Missing Information",
        description: "Please provide your name, email, and phone number",
        variant: "destructive" as any,
      });
      return;
    }

    try {
      setSubmitting(true);

      const res = await fetch("/api/ics25/bronze-promotion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          instagramProofUrl,
          linkedinProofUrl,
          name,
          email,
          phone,
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.ok) {
        throw new Error(data?.message || "Failed to submit promotion");
      }

      toast({
        title: "Promotion Submitted!",
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
          onClick={() => router.push("/checkout?tier=bronze")}
          className="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 mb-6"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Checkout
        </button>

        <div className="relative">
          <div aria-hidden className="pointer-events-none absolute -inset-2 rounded-[32px] bg-gradient-to-br from-amber-600/12 via-transparent to-amber-800/12 blur-2xl" />
          
          <div className="relative rounded-3xl border border-white/10 bg-white/60 dark:bg-zinc-950/60 backdrop-blur-xl p-8">
            <div className="mb-6">
              <h1 className="text-3xl font-bold text-zinc-900 dark:text-zinc-100 mb-2">
                Bronze Pass - Promotion Tasks
              </h1>
              <p className="text-zinc-600 dark:text-zinc-400">
                Complete these 2 simple tasks to unlock your <strong>free</strong> Bronze Pass for ICS'25!
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
                    <p className="text-xs text-zinc-500 dark:text-zinc-500">
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
                    <p className="text-xs text-zinc-500 dark:text-zinc-500">
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
              </div>

              <div className="space-y-4">
                <div>
                  <Label htmlFor="instagram">Instagram Story Link *</Label>
                  <Input
                    id="instagram"
                    type="url"
                    value={instagramProofUrl}
                    onChange={(e) => setInstagramProofUrl(e.target.value)}
                    placeholder="https://instagram.com/stories/..."
                    required
                  />
                  <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-500">
                    Paste the link to your Instagram story (it should be public or saved to highlights)
                  </p>
                </div>

                <div>
                  <Label htmlFor="linkedin">LinkedIn Post Link *</Label>
                  <Input
                    id="linkedin"
                    type="url"
                    value={linkedinProofUrl}
                    onChange={(e) => setLinkedinProofUrl(e.target.value)}
                    placeholder="https://linkedin.com/posts/..."
                    required
                  />
                  <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-500">
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
                  <li>• Once approved, you can complete your Bronze Pass registration</li>
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

              <p className="text-xs text-center text-zinc-500">
                By submitting, you agree to complete both promotional tasks as described
              </p>
            </form>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
