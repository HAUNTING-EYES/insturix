import { auth } from "@clerk/nextjs/server";
import { Sparkles } from "lucide-react";
import { ClientWrapper } from "@/components/dashboard/Alyzitron/ClientWrapper";

// This is a Server Component. Do not use framer-motion primitives directly here.

export const revalidate = 30;

export default async function AlyzitronDashboard() {
  const session = await auth();
  if (!session?.userId) return null;

  const mockUsage = { minutesUsed: 48, minutesCap: 60 };

  return (
    <div className="container mx-auto p-4 sm:p-6 lg:p-8 relative">
      {/* Intake Hero */}
      <section className="relative overflow-hidden rounded-2xl border border-zinc-800/80 bg-gradient-to-b from-zinc-950/90 to-zinc-900/40 p-5 sm:p-7 md:p-10">
        <div className="max-w-3xl">
          <div className="inline-flex items-center gap-2 rounded-full border border-zinc-800/80 bg-zinc-900/40 px-3 py-1 text-xs text-zinc-300 mb-4">
            <Sparkles className="h-3.5 w-3.5 text-blue-400" />
            Diagnostic Lab
          </div>
          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-semibold tracking-tight text-zinc-100">
            Upload with confidence.
            <br className="hidden sm:block" />
            Get your video&apos;s check-up.
          </h1>
          <p className="mt-3 sm:mt-4 text-zinc-400 text-sm sm:text-base max-w-2xl">
            A premium, fluid, and actionable analysis experience. Drag-and-drop
            or paste a link to begin.
          </p>

          {/* Usage meter (subtle near Begin Analysis) */}
          <div className="mt-4 text-xs text-zinc-400">
            Monthly analysis allowance:{" "}
            <span className="text-zinc-200 font-medium">
              {mockUsage.minutesUsed} / {mockUsage.minutesCap} minutes
            </span>{" "}
            remaining.
          </div>
        </div>

        {/* Client-side Intake and History */}
        <div className="mt-6 sm:mt-8">
          <ClientWrapper />
        </div>

        {/* Ambient background shape (static) */}
        <div className="pointer-events-none absolute -top-20 -right-24 h-72 w-72 rounded-full bg-blue-500/10 blur-3xl" />
      </section>
    </div>
  );
}
