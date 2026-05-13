import SocializeDashboard from "@/components/dashboard/Socialize/SocializeDashboard";
import { Share2 } from "lucide-react";
import { currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import React, { Suspense } from "react";
import { LoadingScreen } from "@/components/Loader/LoadingScreen";
import { fetchSocializeUser } from "@/lib/socialize/main";
import { PipelineBreadcrumb } from "@/components/dashboard/shared/PipelineBreadcrumb";

export const revalidate = 0; // Revalidate on every request

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
      <PipelineBreadcrumb currentStep="share" />
      {/* Page Header */}
      <div className="mb-8">
        <h1 className="text-[44px] font-semibold tracking-tight text-zinc-10 flex items-center gap-3">
          <Share2 className="h-8 w-8" style={{ color: '#D4A652' }} />
          Social
        </h1>
        <p className="mt-3 text-lg text-zinc-400 font-light">
          Connect your audience to all your content with one simple link
        </p>
      </div>

      {/* Dashboard Content */}
      <Suspense fallback={<LoadingScreen />}>
        <SocializeDashboard initialData={initialData} />
      </Suspense>
    </div>
  );
}
