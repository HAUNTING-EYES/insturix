import { Suspense } from "react";
import { ProfileContent } from "@/components/dashboard/Socialize/ProfileContent";
import { ProfileSkeleton } from "@/components/skeletons/ProfileSkeleton";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";

export default async function SocializePublicProfilePage({
  params,
}: {
  params: Promise<{ uniqueUsername: string }>;
}) {
  // Properly await the params in Next.js 15
  const resolvedParams = await params;

  return (
    <>
    <Navbar />
    <div className="min-h-screen bg-[#0e1117] flex flex-col items-center justify-center p-4 relative overflow-hidden">
      <Suspense fallback={<ProfileSkeleton />}>
        <ProfileContent uniqueUsername={resolvedParams.uniqueUsername} />
      </Suspense>
    </div>
    <Footer />
    </>
  );
}
