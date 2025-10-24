import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import CursorEffect from "@/components/ui/CursorEffect";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { XCircle, ArrowRight } from "lucide-react";
import Link from "next/link";
import { getIcs25Db } from "@/lib/ics25-mongo";
import Creator from "@/schemas/ics25/Creator";

export const metadata = {
  title: "Application Not Approved · Creator Pass | Insturix",
  description: "Your Creator Pass application was not approved.",
};

export default async function RejectedPage() {
  const { userId } = await auth();
  if (!userId) {
    redirect("/signin?redirect_url=/checkout/creator/rejected");
  }

  // Fetch rejection details
  await getIcs25Db();
  const creator = await Creator.findOne({ clerkUserId: userId }).lean();
  
  // Redirect if not rejected
  if (!creator || (creator as any).status !== 'rejected') {
    redirect("/checkout");
  }
  
  const rejectionReason = (creator as any)?.rejectionReason || "Your application did not meet the eligibility criteria.";

  return (
    <div className="relative min-h-screen overflow-hidden bg-white dark:bg-zinc-950">
      <div className="relative z-20">
        <Navbar />
      </div>

      {/* Backdrop consistent with ICS'25 styling */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute inset-0 bg-gradient-to-br from-blue-50 via-white to-purple-50 dark:from-zinc-950 dark:via-zinc-950 dark:to-zinc-950" />
        <div className="absolute inset-0">
          <div className="absolute -top-24 -right-24 w-[600px] h-[600px] rounded-full bg-gradient-to-br from-rose-500/15 via-transparent to-orange-500/15 blur-3xl" />
          <div className="absolute -bottom-24 -left-24 w-[600px] h-[600px] rounded-full bg-gradient-to-br from-red-500/15 via-transparent to-pink-500/15 blur-3xl" />
        </div>
        <div className="absolute inset-0 bg-gradient-radial from-white/50 via-transparent to-transparent dark:from-zinc-800/40" />
      </div>

      <CursorEffect variant="glow" color="rgba(244, 63, 94, 0.09)" size={900} blur={180} />

      <main className="relative z-10 max-w-3xl mx-auto px-4 py-12">
        <div className="rounded-3xl border border-white/10 bg-white/60 dark:bg-zinc-950/60 backdrop-blur-xl p-8 md:p-12">
          <div className="text-center space-y-6">
            {/* Icon */}
            <div className="flex justify-center">
              <div className="relative">
                <div className="absolute inset-0 bg-gradient-to-br from-rose-500/20 to-red-500/20 blur-2xl rounded-full" />
                <div className="relative bg-gradient-to-br from-rose-500 to-red-500 p-4 rounded-full">
                  <XCircle className="w-12 h-12 text-white" />
                </div>
              </div>
            </div>

            {/* Title */}
            <div>
              <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight text-zinc-900 dark:text-zinc-100 mb-3">
                Application Not Approved
              </h1>
              <p className="text-lg text-zinc-600 dark:text-zinc-400">
                We're sorry, but your Creator Pass application was not approved
              </p>
            </div>

            {/* Rejection Reason */}
            <div className="bg-rose-500/10 dark:bg-rose-500/20 border border-rose-500/30 rounded-2xl p-6">
              <div className="text-left">
                <h3 className="font-semibold text-zinc-900 dark:text-zinc-100 mb-2">
                  Reason
                </h3>
                <p className="text-sm text-zinc-600 dark:text-zinc-400">
                  {rejectionReason}
                </p>
              </div>
            </div>

            {/* Alternative Options */}
            <div className="border-t border-white/10 pt-6 mt-6">
              <h3 className="font-semibold text-zinc-900 dark:text-zinc-100 mb-4">
                Still Want to Attend ICS'25?
              </h3>
              <p className="text-sm text-zinc-600 dark:text-zinc-400 mb-6">
                Choose from our other attendee pass options and secure your spot at India's biggest creator summit!
              </p>
              
              <div className="grid md:grid-cols-3 gap-4">
                {/* Bronze */}
                <Link 
                  href="/checkout?tier=bronze"
                  className="group border border-white/20 hover:border-amber-500/50 rounded-2xl p-4 transition-all hover:scale-105"
                >
                  <div className="text-center">
                    <h4 className="font-bold text-zinc-900 dark:text-zinc-100 mb-1">Bronze Pass</h4>
                    <p className="text-2xl font-bold text-amber-600 dark:text-amber-500 mb-2">FREE</p>
                    <p className="text-xs text-zinc-600 dark:text-zinc-400 mb-3">
                      Access to panel talks & sessions
                    </p>
                    <div className="flex items-center justify-center text-sm text-sky-500 group-hover:gap-2 transition-all">
                      Select <ArrowRight className="w-4 h-4 ml-1 group-hover:translate-x-1 transition-transform" />
                    </div>
                  </div>
                </Link>

                {/* Silver */}
                <Link 
                  href="/checkout?tier=silver"
                  className="group border border-white/20 hover:border-slate-500/50 rounded-2xl p-4 transition-all hover:scale-105"
                >
                  <div className="text-center">
                    <h4 className="font-bold text-zinc-900 dark:text-zinc-100 mb-1">Silver Pass</h4>
                    <p className="text-2xl font-bold text-slate-600 dark:text-slate-400 mb-2">₹2,500</p>
                    <p className="text-xs text-zinc-600 dark:text-zinc-400 mb-3">
                      Workshops & gaming zones
                    </p>
                    <div className="flex items-center justify-center text-sm text-sky-500 group-hover:gap-2 transition-all">
                      Select <ArrowRight className="w-4 h-4 ml-1 group-hover:translate-x-1 transition-transform" />
                    </div>
                  </div>
                </Link>

                {/* Gold */}
                <Link 
                  href="/checkout?tier=gold"
                  className="group border border-white/20 hover:border-yellow-500/50 rounded-2xl p-4 transition-all hover:scale-105"
                >
                  <div className="text-center">
                    <h4 className="font-bold text-zinc-900 dark:text-zinc-100 mb-1">Gold Pass</h4>
                    <p className="text-2xl font-bold text-yellow-600 dark:text-yellow-500 mb-2">₹5,000</p>
                    <p className="text-xs text-zinc-600 dark:text-zinc-400 mb-3">
                      VIP perks & networking
                    </p>
                    <div className="flex items-center justify-center text-sm text-sky-500 group-hover:gap-2 transition-all">
                      Select <ArrowRight className="w-4 h-4 ml-1 group-hover:translate-x-1 transition-transform" />
                    </div>
                  </div>
                </Link>
              </div>
            </div>

            {/* Contact */}
            <div className="pt-4">
              <p className="text-sm text-zinc-500 dark:text-zinc-500">
                Have questions?{" "}
                <a href="mailto:support@insturix.com" className="text-sky-500 hover:underline">
                  Contact us
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
