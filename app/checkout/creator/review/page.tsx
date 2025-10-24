import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import CursorEffect from "@/components/ui/CursorEffect";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { Clock, CheckCircle2, AlertCircle } from "lucide-react";
import { getIcs25Db } from "@/lib/ics25-mongo";
import Creator from "@/schemas/ics25/Creator";

export const metadata = {
  title: "Under Review · Creator Pass | Insturix",
  description: "Your Creator Pass application is under review.",
};

export default async function UnderReviewPage() {
  const { userId } = await auth();
  if (!userId) {
    redirect("/signin?redirect_url=/checkout/creator/review");
  }

  // Check creator application status
  await getIcs25Db();
  const creator = await Creator.findOne({ clerkUserId: userId }).lean();
  
  // Redirect based on status
  if (!creator) {
    // No application found, let them submit
    redirect("/checkout?tier=creators");
  }
  
  const status = (creator as any).status;
  
  // If approved, redirect to checkout to complete payment
  if (status === 'approved') {
    redirect("/checkout?tier=creators");
  }
  
  // If rejected, redirect to rejection page
  if (status === 'rejected') {
    redirect("/checkout/creator/rejected");
  }
  
  // If pending, show this page (no redirect needed)

  return (
    <div className="relative min-h-screen overflow-hidden bg-white dark:bg-zinc-950">
      <div className="relative z-20">
        <Navbar />
      </div>

      {/* Backdrop consistent with ICS'25 styling */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute inset-0 bg-gradient-to-br from-blue-50 via-white to-purple-50 dark:from-zinc-950 dark:via-zinc-950 dark:to-zinc-950" />
        <div className="absolute inset-0">
          <div className="absolute -top-24 -right-24 w-[600px] h-[600px] rounded-full bg-gradient-to-br from-sky-500/15 via-transparent to-fuchsia-500/15 blur-3xl" />
          <div className="absolute -bottom-24 -left-24 w-[600px] h-[600px] rounded-full bg-gradient-to-br from-purple-500/15 via-transparent to-cyan-500/15 blur-3xl" />
        </div>
        <div className="absolute inset-0 bg-gradient-radial from-white/50 via-transparent to-transparent dark:from-zinc-800/40" />
      </div>

      <CursorEffect variant="glow" color="rgba(59, 130, 246, 0.09)" size={900} blur={180} />

      <main className="relative z-10 max-w-3xl mx-auto px-4 py-12">
        <div className="rounded-3xl border border-white/10 bg-white/60 dark:bg-zinc-950/60 backdrop-blur-xl p-8 md:p-12">
          <div className="text-center space-y-6">
            {/* Icon */}
            <div className="flex justify-center">
              <div className="relative">
                <div className="absolute inset-0 bg-gradient-to-br from-sky-500/20 to-fuchsia-500/20 blur-2xl rounded-full" />
                <div className="relative bg-gradient-to-br from-sky-500 to-fuchsia-500 p-4 rounded-full">
                  <Clock className="w-12 h-12 text-white" />
                </div>
              </div>
            </div>

            {/* Title */}
            <div>
              <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight text-zinc-900 dark:text-zinc-100 mb-3">
                Application Under Review
              </h1>
              <p className="text-lg text-zinc-600 dark:text-zinc-400">
                Your Creator Pass application is being reviewed by our team
              </p>
            </div>

            {/* Status Timeline */}
            <div className="py-8 space-y-4">
              <div className="flex items-start gap-4 text-left">
                <div className="flex-shrink-0">
                  <div className="bg-green-500/20 p-2 rounded-full">
                    <CheckCircle2 className="w-5 h-5 text-green-500" />
                  </div>
                </div>
                <div>
                  <h3 className="font-semibold text-zinc-900 dark:text-zinc-100">Application Submitted</h3>
                  <p className="text-sm text-zinc-600 dark:text-zinc-400">
                    We've received your social media links
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-4 text-left">
                <div className="flex-shrink-0">
                  <div className="bg-sky-500/20 p-2 rounded-full animate-pulse">
                    <Clock className="w-5 h-5 text-sky-500" />
                  </div>
                </div>
                <div>
                  <h3 className="font-semibold text-zinc-900 dark:text-zinc-100">Under Review</h3>
                  <p className="text-sm text-zinc-600 dark:text-zinc-400">
                    Our team is verifying your follower count (10k+ required on any platform)
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-4 text-left opacity-50">
                <div className="flex-shrink-0">
                  <div className="bg-zinc-200 dark:bg-zinc-800 p-2 rounded-full">
                    <AlertCircle className="w-5 h-5 text-zinc-400" />
                  </div>
                </div>
                <div>
                  <h3 className="font-semibold text-zinc-900 dark:text-zinc-100">Decision Pending</h3>
                  <p className="text-sm text-zinc-600 dark:text-zinc-400">
                    You'll be notified once your application is reviewed
                  </p>
                </div>
              </div>
            </div>

            {/* Timeline Info */}
            <div className="bg-sky-500/10 dark:bg-sky-500/20 border border-sky-500/30 rounded-2xl p-6">
              <div className="flex items-start gap-3">
                <Clock className="w-5 h-5 text-sky-500 mt-0.5 flex-shrink-0" />
                <div className="text-left">
                  <h3 className="font-semibold text-zinc-900 dark:text-zinc-100 mb-1">
                    Review Timeline
                  </h3>
                  <p className="text-sm text-zinc-600 dark:text-zinc-400">
                    Applications are typically reviewed within <span className="font-semibold text-sky-500">24-48 hours</span>. 
                    You'll receive an email notification once your application has been processed.
                  </p>
                </div>
              </div>
            </div>

            {/* Requirements Reminder */}
            <div className="border-t border-white/10 pt-6 mt-6">
              <h3 className="font-semibold text-zinc-900 dark:text-zinc-100 mb-3">
                Eligibility Requirements
              </h3>
              <ul className="text-sm text-zinc-600 dark:text-zinc-400 space-y-2">
                <li>✓ 10,000+ followers on Instagram, YouTube, or LinkedIn</li>
                <li>✓ Active content creation in the past 3 months</li>
                <li>✓ Valid social media profiles</li>
              </ul>
            </div>

            {/* Actions */}
            <div className="pt-4">
              <p className="text-sm text-zinc-500 dark:text-zinc-500 mb-4">
                Need help? Contact us at{" "}
                <a href="mailto:support@insturix.com" className="text-sky-500 hover:underline">
                  support@insturix.com
                </a>
              </p>
            </div>
          </div>
        </div>
      </main>

      <div className="relative z-20">
        <Footer />
      </div>
    </div>
  );
}
