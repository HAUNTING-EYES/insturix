import { auth } from "@clerk/nextjs/server";
import { UploaderXClientWrapper } from "@/components/dashboard/UploaderX/ClientWrapper";

export const revalidate = 30;

export default async function UploaderXDashboard() {
  const session = await auth();
  if (!session?.userId) return null;

  return (
    <div className="container mx-auto p-4 sm:p-6 lg:p-8 relative">
      <section className="relative overflow-hidden rounded-2xl border border-zinc-800/80 bg-gradient-to-b from-zinc-950/90 to-zinc-900/40 p-5 sm:p-7 md:p-10">
        <div className="max-w-3xl">
          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-semibold tracking-tight text-zinc-100">
            UploaderX
          </h1>
          <p className="mt-3 text-zinc-300 max-w-2xl">
            A service in Insturix that allows users to upload content to multiple platforms from one place.
          </p>
        </div>

        <div className="mt-6 sm:mt-8">
          <UploaderXClientWrapper />
        </div>

        <div className="pointer-events-none absolute -top-20 -right-24 h-72 w-72 rounded-full bg-emerald-500/10 blur-3xl" />
      </section>
    </div>
  );
}


