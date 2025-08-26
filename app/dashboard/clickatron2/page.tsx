import { auth } from "@clerk/nextjs/server";
import { Clickatron2Layout } from "@/components/dashboard/Clickatron2/Clickatron2Layout";

export const revalidate = 30;

export default async function Clickatron2Dashboard() {
  const session = await auth();
  if (!session?.userId) return null;

  return (
    <div className="container mx-auto p-4 sm:p-6 lg:p-8 relative">
      {/* Hero Section - Inspired by Alyzitron */}
      <section className="relative overflow-hidden rounded-2xl border border-zinc-800/80 bg-gradient-to-b from-zinc-950/90 to-zinc-900/40 p-5 sm:p-7 md:p-10">
        <div className="max-w-3xl">
          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-semibold tracking-tight text-zinc-100">
            Turn ideas into thumbnails. <br className="hidden sm:block" />
            Your creative lab awaits.
          </h1>

          <p className="mt-4 text-lg text-zinc-400 max-w-2xl">
            From video concept to stunning thumbnail in seconds. Let AI guide
            your creative process.
          </p>
        </div>

        {/* Main Interface */}
        <div className="mt-6 sm:mt-8">
          <Clickatron2Layout />
        </div>

        {/* Ambient background shape */}
        <div className="pointer-events-none absolute -top-20 -right-24 h-72 w-72 rounded-full bg-purple-500/10 blur-3xl" />
      </section>
    </div>
  );
}
