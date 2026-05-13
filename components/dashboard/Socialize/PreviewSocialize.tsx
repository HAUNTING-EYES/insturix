
import { ProfileContent } from "./ProfileContent";
import { SocializeUser } from "@/lib/socialize/main";
import type { SocializeLink, BannerConfig } from "@/schemas/Socialize";
import { getExpiresAtFromDuration } from "@/lib/utils/notification";

interface SocializePreviewProps {
  logo: string | null;
  profileTitle: string;
  bio: string;
  links: SocializeLink[];
  banner?: BannerConfig;
  status?: string;
  accentColor?: string;
}

export function SocializePreview({
  logo,
  profileTitle,
  bio,
  links,
  banner,
  status,
  accentColor,
}: SocializePreviewProps) {
  // --- Updated Logic for Preview Data (Fixed Types) ---

  // 1️⃣ Expired update (should NOT show)
  const expiredTime = new Date();
  expiredTime.setDate(expiredTime.getDate() - 2);

  const expiredUpdate = {
    message: "⚠️ This update expired 2 days ago and should be hidden.",
    duration: 1,
    timestamp: expiredTime.toISOString(), // ✅ ISO string
    expiresAt: expiredTime.toISOString(), // ✅ ISO string
  };

  // 2️⃣ Active update (should be visible)
  const activeUpdateDuration = 10; // hours
  const now = new Date();

  const activeUpdate = {
    message: "✨ This update is active (Expires in 10 hours).",
    duration: activeUpdateDuration,
    timestamp: now.toISOString(), // ✅ ISO string
    expiresAt: getExpiresAtFromDuration(activeUpdateDuration), // ✅ Already ISO string
  };

  // 3️⃣ Permanent update (always visible)
  const permanentUpdate = {
    message: "📢 This is a permanent announcement.",
    duration: 0,
    timestamp: now.toISOString(), // ✅ ISO string
  };

  // --- End of Updated Logic ---

  const socializeData: SocializeUser = {
    profileImage: logo || "",
    username: profileTitle,
    uniqueUsername: profileTitle,
    bio,
    links,
    banner,
    status: status || "Creating something new",
    accentColor: accentColor || "gold",
    clerkUserId: "preview-user-id",
    notifications: [activeUpdate, expiredUpdate, permanentUpdate],
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  return (
    <section className="relative w-full max-w-[500px] h-[40rem] p-8 hidden md:block mx-auto">
      <div className="absolute left-1/2 -translate-x-1/2 top-1/2 -translate-y-1/2 bg-[#131312] rounded-3xl p-4 border-[#1C1B19] border-2 flex flex-col items-center shadow-xl overflow-hidden">
        <div className="w-[300px] h-[580px] bg-[#0B0B0A] rounded-2xl overflow-hidden relative flex flex-col justify-start items-center z-10">
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
