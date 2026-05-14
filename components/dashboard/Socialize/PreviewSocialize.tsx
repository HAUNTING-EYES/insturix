
import { ProfileContent } from "./ProfileContent";
import { SocializeUser } from "@/lib/socialize/main";
import type { SocializeLink, BannerConfig } from "@/schemas/Socialize";


interface SocializePreviewProps {
  logo: string | null;
  profileTitle: string;
  bio: string;
  links: SocializeLink[];
  banner?: BannerConfig;
  status?: string;
  accentColor?: string;
  notifications?: Array<{message: string; duration: number; timestamp?: string; expiresAt?: string}>;
}

export function SocializePreview({
  logo,
  profileTitle,
  bio,
  links,
  banner,
  status,
  accentColor,
  notifications,
}: SocializePreviewProps) {
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
    notifications: notifications || [],
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  return (
    <div
      style={{
        background: "#131312",
        borderRadius: 32,
        padding: 10,
        border: "2px solid #282724",
        boxShadow: "0 20px 60px rgba(0,0,0,.5), 0 0 80px rgba(212,166,82,.04)",
        width: 420,
        overflow: "hidden",
        position: "relative",
      }}
    >
      {/* Notch */}
      <div style={{ width: 100, height: 22, background: "#0B0B0A", borderRadius: "0 0 14px 14px", margin: "0 auto" }} />
      {/* Screen */}
      <div
        style={{
          borderRadius: 22,
          overflow: "hidden",
          background: "#0B0B0A",
          maxHeight: 560,
          overflowY: "auto",
        }}
        className="scrollbar-none"
      >
        <div style={{ padding: "0 12px 16px" }}>
          <ProfileContent
            socializeData={socializeData}
            uniqueUsername={profileTitle}
            isPreview={true}
          />
        </div>
      </div>
    </div>
  );
}
