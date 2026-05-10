"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { useUser } from "@clerk/nextjs";
import { Button } from "@/components/ui/button";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { Clock, CheckCircle2, XCircle, ArrowRight } from "lucide-react";

export default function BronzeReviewPage() {
  const router = useRouter();
  const { isSignedIn } = useUser();
  
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<string | null>(null);
  const [rejectionReason, setRejectionReason] = useState<string | null>(null);
  const hasRedirectedRef = useRef(false);

  useEffect(() => {
    if (!isSignedIn) {
      router.push("/signin?redirect_url=/checkout/bronze/review");
      return;
    }

    const checkStatus = async () => {
      // Prevent multiple redirects
      if (hasRedirectedRef.current) return;
      
      try {
        const res = await fetch("/api/ics25/bronze-promotion");
        if (res.ok) {
          const data = await res.json();
          const bronzePromotion = data?.bronzePromotion;
          
          if (!bronzePromotion || bronzePromotion.status === 'none') {
            // No submission yet, redirect to promotion page
            if (!hasRedirectedRef.current) {
              hasRedirectedRef.current = true;
              router.push("/checkout/bronze/promotion");
            }
            return;
          }

          setStatus(bronzePromotion.status);
          setRejectionReason(bronzePromotion.rejectionReason || null);

          // If verified, automatically redirect to confirmation (registration is complete)
          if (bronzePromotion.status === 'verified' && !hasRedirectedRef.current) {
            hasRedirectedRef.current = true;
            // Immediately redirect to confirmation page
            router.push("/checkout/ics25/confirmation");
            return;
          }
        }
        
        setLoading(false);
      } catch (e: any) {
        console.error("Error checking status:", e);
        setLoading(false);
      }
    };

    checkStatus();

    // Poll for status updates every 30 seconds (but don't redirect if already redirected)
    const interval = setInterval(() => {
      if (!hasRedirectedRef.current) {
        checkStatus();
      }
    }, 30000);
    return () => clearInterval(interval);
  }, [isSignedIn, router]);

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
      
      <main className="max-w-2xl mx-auto px-4 py-16">
        <div className="relative">
          <div aria-hidden className="pointer-events-none absolute -inset-2 rounded-[32px] bg-gradient-to-br from-amber-600/12 via-transparent to-amber-800/12 blur-2xl" />
          
          <div className="relative rounded-3xl border border-white/10 bg-white/60 dark:bg-zinc-950/60 backdrop-blur-xl p-8 text-center">
            {status === 'submitted' && (
              <>
                <div className="mx-auto mb-6 inline-flex items-center justify-center size-16 rounded-2xl bg-amber-500/15 text-amber-600 dark:text-amber-400">
                  <Clock className="w-8 h-8" />
                </div>
                <h1 className="text-[32px] font-bold text-zinc-900 dark:text-zinc-100 mb-3">
                  Application Under Review
                </h1>
                <p className="text-zinc-600 dark:text-zinc-400 mb-6">
                  Thank you for submitting your promotional tasks! Our team is reviewing your submission.
                </p>
                <div className="rounded-2xl border border-amber-600/30 bg-amber-500/10 p-6 text-left mb-6">
                  <h3 className="font-semibold text-zinc-900 dark:text-zinc-100 mb-3">
                    What's next?
                  </h3>
                  <ul className="text-sm text-zinc-600 dark:text-zinc-400 space-y-2">
                    <li className="flex items-start gap-2">
                      <span className="text-amber-600 mt-0.5">•</span>
                      <span>We'll review your Instagram and LinkedIn posts within <strong>48 hours</strong></span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-amber-600 mt-0.5">•</span>
                      <span>You'll receive an email notification once approved</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-amber-600 mt-0.5">•</span>
                      <span>This page will automatically update when your status changes</span>
                    </li>
                  </ul>
                </div>
                <Button
                  onClick={() => router.push("/ics25")}
                  variant="outline"
                  className="border-zinc-300 dark:border-zinc-700"
                >
                  Back to ICS'25 Home
                </Button>
              </>
            )}

            {status === 'verified' && (
              <>
                <div className="mx-auto mb-6 inline-flex items-center justify-center size-16 rounded-2xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
                  <CheckCircle2 className="w-8 h-8" />
                </div>
                <h1 className="text-[32px] font-bold text-zinc-900 dark:text-zinc-100 mb-3">
                  Promotion Approved! 🎉
                </h1>
                <p className="text-zinc-600 dark:text-zinc-400 mb-6">
                  Congratulations! Your promotional tasks have been verified. Your Silver Pass registration is complete.
                </p>
                <div className="rounded-2xl border border-emerald-600/30 bg-emerald-500/10 p-4 mb-6">
                  <p className="text-sm text-zinc-700 dark:text-zinc-300">
                    Redirecting you to your confirmation page...
                  </p>
                </div>
              </>
            )}

            {status === 'rejected' && (
              <>
                <div className="mx-auto mb-6 inline-flex items-center justify-center size-16 rounded-2xl bg-red-500/15 text-red-600 dark:text-red-400">
                  <XCircle className="w-8 h-8" />
                </div>
                <h1 className="text-[32px] font-bold text-zinc-900 dark:text-zinc-100 mb-3">
                  Submission Not Approved
                </h1>
                <p className="text-zinc-600 dark:text-zinc-400 mb-6">
                  Unfortunately, your submission didn't meet the requirements.
                </p>
                {rejectionReason && (
                  <div className="rounded-2xl border border-red-600/30 bg-red-500/10 p-4 mb-6 text-left">
                    <h3 className="font-semibold text-red-600 dark:text-red-400 mb-2">
                      Reason for rejection:
                    </h3>
                    <p className="text-sm text-zinc-700 dark:text-zinc-300">
                      {rejectionReason}
                    </p>
                  </div>
                )}
                <div className="flex flex-col sm:flex-row gap-3 justify-center">
                  <Button
                    onClick={() => router.push("/checkout/bronze/promotion")}
                    className="bg-amber-600 hover:bg-amber-700 text-white font-semibold"
                  >
                    Resubmit Promotion
                  </Button>
                  <Button
                    onClick={() => router.push("/checkout?tier=silver")}
                    variant="outline"
                    className="border-zinc-300 dark:border-zinc-700"
                  >
                    Choose Another Pass
                  </Button>
                </div>
              </>
            )}
          </div>
        </div>

        <div className="mt-8 text-center">
          <p className="text-sm text-zinc-500 dark:text-zinc-500">
            Questions? Contact us at{" "}
            <a href="mailto:support@insturix.com" className="text-amber-600 hover:underline">
              support@insturix.com
            </a>
          </p>
        </div>
      </main>

      <Footer />
    </div>
  );
}
