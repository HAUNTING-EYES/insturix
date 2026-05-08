

"use client";

import { useState, useEffect } from "react";
import { Bell, ExternalLink } from "lucide-react";
import { getPlatformIcon } from "@/components/dashboard/Socialize/SocializeIcons";
import { NotificationPanel } from "@/components/dashboard/Socialize/NotificationPanel";
import { SocializeUser } from "@/lib/socialize/main";
import type { BannerConfig } from "@/schemas/Socialize";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { isNotificationExpired } from "@/lib/utils/notification";
import { cn } from "@/lib/utils";

interface ProfileContentProps {
  socializeData: SocializeUser;
  uniqueUsername: string;
  isPreview?: boolean;
}

export function ProfileContent({
  socializeData,
  uniqueUsername,
  isPreview = false,
}: ProfileContentProps) {
  const [showNotification, setShowNotification] = useState(false);

  // Auto-close notification after 5 seconds
  useEffect(() => {
    let timeout: NodeJS.Timeout;
    if (showNotification) {
      timeout = setTimeout(() => setShowNotification(false), 5000);
    }
    return () => clearTimeout(timeout);
  }, [showNotification]);

  // Extract profile data
  const {
    username,
    bio,
    links = [],
    notifications = [],
    profileImage,
    banner,
  } = socializeData;

  const displayName = username || uniqueUsername;

  // ✅ Safe filtering: prevents errors from invalid/missing data
  const validNotifications = Array.isArray(notifications)
    ? notifications.filter(
        (n) => n && typeof n === "object" && !isNotificationExpired(n)
      )
    : [];

  const hasNotifications = validNotifications.length > 0;
  const hasBio = bio && bio.length > 0;

  // Default banner fallback
  const defaultBanner: BannerConfig = {
    type: "color",
    value: "#0e6b9c",
    gradientType: "linear",
    gradientColors: [],
  };

  const bannerConfig = banner || defaultBanner;

  const createGradientCSS = (
    colors: Array<{ color: string; position: number }>,
    type: string
  ) => {
    if (type === "radial") {
      return `radial-gradient(circle, ${colors
        .map((c) => `${c.color} ${c.position}%`)
        .join(", ")})`;
    }
    return `linear-gradient(135deg, ${colors
      .map((c) => `${c.color} ${c.position}%`)
      .join(", ")})`;
  };

  const renderBanner = () => {
    switch (bannerConfig.type) {
      case "image":
        return (
          <div
            className={cn(
              "w-full h-24 bg-[#23232a] flex items-center justify-center",
              isPreview && "h-16"
            )}
          >
            <img
              src={bannerConfig.value}
              alt="Profile banner"
              className="w-full h-full object-cover"
              onError={(e) => {
                const img = e.currentTarget;
                console.error(
                  "Profile banner image failed to load:",
                  bannerConfig.value
                );
                img.style.display = "none";
                img.parentElement!.innerHTML = `
                  <div class="w-full h-full flex items-center justify-center text-zinc-400">
                    <div class="text-center">
                      <div class="text-2xl mb-2">🖼️</div>
                      <div class="text-sm">Banner unavailable</div>
                    </div>
                  </div>
                `;
              }}
            />
          </div>
        );
      case "color":
        return (
          <div
            className={cn("w-full h-24", isPreview && "h-16")}
            style={{ backgroundColor: bannerConfig.value }}
          />
        );
      case "gradient":
        return (
          <div
            className={cn("w-full h-24", isPreview && "h-16")}
            style={{
              background:
                bannerConfig.gradientColors &&
                bannerConfig.gradientColors.length > 0
                  ? createGradientCSS(
                      bannerConfig.gradientColors,
                      bannerConfig.gradientType || "linear"
                    )
                  : "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
            }}
          />
        );
      default:
        return (
          <div
            className={cn("w-full h-24 bg-[#23232a]", isPreview && "h-16")}
          />
        );
    }
  };

  return (
    <div
      className={cn(
        "w-full max-w-md flex flex-col items-center z-10 gap-4",
        isPreview && "gap-2"
      )}
    >
      {/* Profile header */}
      <Card
        className={cn(
          "w-full bg-[#1a1a1f] border-[#2a2a35] shadow-xl overflow-hidden",
          isPreview && "shadow-none border-none"
        )}
      >
        {renderBanner()}

        <CardContent className={cn("p-6 relative", isPreview && "p-3")}>
          <Avatar
            className={cn(
              "w-24 h-24 border-4 border-[#1a1a1f] absolute -top-12 left-6 shadow-lg",
              isPreview && "w-16 h-16 -top-8 left-4"
            )}
          >
            <AvatarImage
              src={profileImage || "/placeholder.svg"}
              alt={displayName}
            />
            <AvatarFallback
              className={cn(
                "bg-[#0e6b9c] text-white text-2xl font-bold",
                isPreview && "text-lg"
              )}
            >
              {typeof displayName === "string"
                ? displayName.charAt(0).toUpperCase()
                : "?"}
            </AvatarFallback>
          </Avatar>

          <div className={cn("mt-12", isPreview && "mt-8")}>
            <h1
              className={cn(
                "text-white text-2xl font-bold mb-1 flex items-center gap-2",
                isPreview && "text-lg"
              )}
            >
              @{displayName}
              <Badge
                variant="outline"
                className="bg-[#0e6b9c] text-white border-[#0e6b9c] text-xs"
              >
                Social
              </Badge>
            </h1>
            {hasBio && (
              <p
                className={cn(
                  "text-gray-300 text-sm mt-2",
                  isPreview && "text-xs"
                )}
              >
                {bio}
              </p>
            )}
          </div>

          {/* Notification Button */}
          {hasNotifications && !isPreview && (
            <Button
              onClick={() => setShowNotification(!showNotification)}
              size="icon"
              variant="outline"
              className={cn(
                "absolute top-6 right-6 w-10 h-10 rounded-full bg-[#0e6b9c] hover:bg-[#0d5d87] border-none shadow-lg",
                showNotification && "bg-[#0d5d87]"
              )}
              aria-label="Show notifications"
            >
              <Bell className="w-5 h-5 text-white" />
              <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full text-white text-xs flex items-center justify-center">
                {validNotifications.length}
              </span>
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Notification Panel */}
      {hasNotifications && showNotification && !isPreview && (
        <NotificationPanel
          notifications={validNotifications ?? []}
          onClose={() => setShowNotification(false)}
        />
      )}

      {/* Social Links */}
      <div className={cn("w-full space-y-3", isPreview && "space-y-2")}>
        {links && links.length > 0 ? (
          links.map((link, i) => (
            <a
              key={i}
              href={link.url}
              target="_blank"
              rel="noopener noreferrer"
              className={cn(
                "flex items-center gap-3 px-5 py-4 bg-[#1a1a1f] hover:bg-[#23232a] text-white rounded-xl transition-all w-full border border-[#2a2a35] transform hover:translate-y-[-2px] hover:shadow-lg group",
                isPreview && "px-3 py-2 gap-2"
              )}
            >
              <div
                className={cn(
                  "w-10 h-10 rounded-full bg-[#23232a] flex items-center justify-center group-hover:bg-[#0e6b9c] transition-colors",
                  isPreview && "w-8 h-8"
                )}
              >
                {getPlatformIcon(link.platform, isPreview)}
              </div>
              <div className="flex-1 overflow-hidden">
                <span className={cn("font-medium", isPreview && "text-sm")}>
                  {link.title && link.title.trim() !== ""
                    ? link.title
                    : link.platform.charAt(0).toUpperCase() +
                      link.platform.slice(1)}
                </span>
                <p
                  className={cn(
                    "text-xs text-gray-400 truncate",
                    isPreview && "hidden"
                  )}
                >
                  {link.url}
                </p>
              </div>
              <ExternalLink
                className={cn(
                  "w-5 h-5 text-gray-400 group-hover:text-white transition-colors",
                  isPreview && "w-4 h-4"
                )}
              />
            </a>
          ))
        ) : (
          <Card
            className={cn(
              "w-full bg-[#1a1a1f] border-[#2a2a35] text-center py-8",
              isPreview && "py-4"
            )}
          >
            <div
              className={cn(
                "w-16 h-16 bg-[#23232a] rounded-full flex items-center justify-center mx-auto mb-4",
                isPreview && "w-12 h-12 mb-2"
              )}
            >
              <span className={cn("text-2xl", isPreview && "text-xl")}>✨</span>
            </div>
            <p className={cn("text-gray-400", isPreview && "text-sm")}>
              No social links added yet
            </p>
          </Card>
        )}
      </div>
    </div>
  );
}
