import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ProfileContent } from "@/components/dashboard/Socialize/ProfileContent";
import { ProfileSkeleton } from "@/components/skeletons/ProfileSkeleton";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { fetchSocializeUser } from "@/lib/socialize/main";
import { ProfileError } from "@/components/dashboard/Socialize/ProfileError";

export default async function Page({
  params,
}: {
  params: Promise<{ uniqueUsername: string }>;
}) {
  const { uniqueUsername } = await params;
  if (uniqueUsername === "favicon.ico") return notFound();
  try {
    // Fetch data on the server
    const socializeData = await fetchSocializeUser(uniqueUsername);

    return (
      <>
        <Navbar />
        <div className="min-h-screen bg-[#0B0B0A] flex flex-col items-center justify-center p-4 relative overflow-hidden">
          <Suspense fallback={<ProfileSkeleton />}>
            <ProfileContent
              socializeData={socializeData}
              uniqueUsername={uniqueUsername}
            />
          </Suspense>
        </div>
        <Footer />
      </>
    );
  } catch {
    // Render an error component if the user is not found or another error occurs
    return (
      <>
        <Navbar />
        <div className="min-h-screen bg-[#0B0B0A] flex flex-col items-center justify-center p-4 relative overflow-hidden">
          <ProfileError />
        </div>
        <Footer />
      </>
    );
  }
}
