import { Suspense } from "react";
import { ProfileContent } from "@/components/dashboard/Socialize/ProfileContent";
import { ProfileSkeleton } from "@/components/skeletons/ProfileSkeleton";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { fetchSocializeUser } from "@/lib/socialize/main";
import { ProfileError } from "@/components/dashboard/Socialize/ProfileError";

export default async function SocializePublicProfilePage({
  params,
}: {
  params: { uniqueUsername: string };
}) {
  try {
    // Fetch data on the server
    const socializeData = await fetchSocializeUser(params.uniqueUsername);

    return (
      <>
        <Navbar />
        <div className="min-h-screen bg-[#0e1117] flex flex-col items-center justify-center p-4 relative overflow-hidden">
          <Suspense fallback={<ProfileSkeleton />}>
            <ProfileContent
              socializeData={socializeData}
              uniqueUsername={params.uniqueUsername}
            />
          </Suspense>
        </div>
        <Footer />
      </>
    );
  } catch (error) {
    // Render an error component if the user is not found or another error occurs
    return (
      <>
        <Navbar />
        <div className="min-h-screen bg-[#0e1117] flex flex-col items-center justify-center p-4 relative overflow-hidden">
          <ProfileError />
        </div>
        <Footer />
      </>
    );
  }
}
