import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import Link from "next/link";

export const metadata = {
  title: "Registration Confirmed · ICS’25 | Insturix",
  description: "You're registered for ICS’25. We'll email your confirmation and next steps.",
};

export default function CheckoutSuccessPage() {
  return (
    <div className="relative min-h-screen overflow-hidden bg-white dark:bg-zinc-950">
      <div className="relative z-20">
        <Navbar />
      </div>

      <div className="pointer-events-none absolute inset-0">
        <div className="absolute inset-0 bg-gradient-to-br from-blue-50 via-white to-purple-50 dark:from-zinc-950 dark:via-zinc-950 dark:to-zinc-950" />
        <div className="absolute inset-0">
          <div className="absolute -top-24 -right-24 w-[600px] h-[600px] rounded-full bg-gradient-to-br from-sky-500/15 via-transparent to-fuchsia-500/15 blur-3xl" />
          <div className="absolute -bottom-24 -left-24 w-[600px] h-[600px] rounded-full bg-gradient-to-br from-purple-500/15 via-transparent to-cyan-500/15 blur-3xl" />
        </div>
        <div className="absolute inset-0 bg-gradient-radial from-white/50 via-transparent to-transparent dark:from-zinc-800/40" />
      </div>

      <main className="relative z-10 max-w-3xl mx-auto px-4 py-16">
        <div className="rounded-3xl border border-white/10 bg-white/70 dark:bg-zinc-900/60 backdrop-blur-xl p-8 text-center">
          <div className="mx-auto mb-4 inline-flex items-center justify-center size-14 rounded-2xl bg-green-500/15 text-green-600 dark:text-green-400">✓</div>
          <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight text-zinc-900 dark:text-zinc-100">You're registered for ICS’25</h1>
          <p className="mt-3 text-zinc-600 dark:text-zinc-400">Your attendee pass has been recorded. We’ll send confirmation and event updates to your registered email.</p>

          <div className="mt-8 flex items-center justify-center">
            <Link href="/ics25" className="inline-flex items-center justify-center rounded-xl bg-zinc-900 text-white px-5 py-3 hover:bg-zinc-800 focus:outline-none focus:ring-2 focus:ring-zinc-500">
              Back to ICS’25
            </Link>
          </div>

          <p className="mt-6 text-xs text-zinc-500">Note: This confirms your registration for ICS’25. If you have any issues, reach out to support.</p>
        </div>
      </main>

      <div className="relative z-20">
        <Footer />
      </div>
    </div>
  );
}
