import { ProfileContent } from "./ProfileContent";
import { SocializeUser } from "@/lib/socialize/main";
import type { SocializeLink, BannerConfig } from "@/schemas/Socialize";

interface SocializePreviewProps {
  logo: string | null;
  profileTitle: string;
  bio: string;
  links: SocializeLink[];
  banner?: BannerConfig;
}

export function SocializePreview({
  logo,
  profileTitle,
  bio,
  links,
  banner,
}: SocializePreviewProps) {
  const socializeData: SocializeUser = {
    profileImage: logo || "",
    username: profileTitle,
    uniqueUsername: profileTitle,
    bio: bio,
    links: links,
    banner: banner,
    // Dummy data for preview context
    clerkUserId: "preview-user-id",
    notifications: [],
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  return (
    <section className="relative w-full max-w-[500px] h-[40rem] p-8 hidden md:block mx-auto">
      <div className="absolute left-1/2 -translate-x-1/2 top-1/2 -translate-y-1/2 bg-[#13131a] rounded-3xl p-4 border-[#2d2d36] border-2 flex flex-col items-center shadow-xl overflow-hidden">
        <div className="w-[300px] h-[580px] bg-[#0e1117] rounded-2xl overflow-hidden relative flex flex-col justify-start items-center z-10">
          <div className="w-full h-full overflow-y-auto p-4">
            <ProfileContent
              socializeData={socializeData}
              uniqueUsername={profileTitle}
              isPreview={true}
            />
          </div>
        </div>
      </div>
    </section>
  );
}
