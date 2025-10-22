import SocializeDashboard from "@/components/dashboard/Socialize/SocializeDashboard";
import { Share2 } from "lucide-react";
import { currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import React, { Suspense } from "react";
import { UniversalLoader } from "@/components/Loader/UniversalLoader";
import { fetchSocializeUser } from "@/lib/socialize/main";

export const revalidate = 60;

export default async function SocializePage() {
  const user = await currentUser();
  if (!user || !user.username) {
    redirect("/sign-in");
  }

  // Fetch the user's socialize profile server-side so we can avoid a default flash
  let initialData = null;
  try {
    initialData = await fetchSocializeUser(user.username);
  } catch (e) {
    // If fetching fails, fall back to client fetch. We intentionally swallow errors here
    // to avoid blocking page rendering (dashboard will re-fetch client-side).
    initialData = null;
    console.error('Failed to fetch initial Socialize data on server:', e);
  }

  return (
    <div className="container mx-auto p-8">
      {/* Page Header */}
      <div className="mb-8">
        <h1 className="text-4xl font-semibold tracking-tight text-zinc-100 flex items-center gap-3">
          <Share2 className="h-8 w-8 text-[#0ea5e9]" />
          Socialize
        </h1>
        <p className="mt-3 text-lg text-zinc-400 font-light">
          Connect your audience to all your content with one simple link
        </p>
      </div>

      {/* Dashboard Content */}
      <Suspense fallback={<UniversalLoader />}>
        <SocializeDashboard initialData={initialData} />
      </Suspense>
    </div>
  );
}
