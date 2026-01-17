import { auth } from "@clerk/nextjs/server";
import { ClientWrapper } from "@/components/dashboard/Alyzitron/ClientWrapper";
import { CreditsCard } from "@/components/shared/CreditsCard";

// This is a Server Component. Do not use framer-motion primitives directly here.

export const revalidate = 30;

export default async function AlyzitronDashboard() {
  const session = await auth();
  if (!session?.userId) return null;

  return (
    <div className="container mx-auto p-4 sm:p-6 lg:p-8 relative">
      {/* Intake Hero */}
      <section className="relative overflow-hidden rounded-2xl border border-zinc-800/80 bg-gradient-to-b from-zinc-950/90 to-zinc-900/40 p-5 sm:p-7 md:p-10">
        <div className="max-w-3xl">
          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-semibold tracking-tight text-zinc-100">
            Upload with confidence.
            <br className="hidden sm:block" />
            Get your video&apos;s check-up.
          </h1>

          {/* Credits display component */}
          <div className="mt-4">
            <CreditsCard className="max-w-sm" />
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

