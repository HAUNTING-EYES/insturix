

"use client";

import { useState, useEffect } from "react";
import { Bell, ExternalLink } from "lucide-react";
import { motion } from "framer-motion";
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

  const [bannerError, setBannerError] = useState(false);

  // Reset error state when banner config changes
  useEffect(() => {
    setBannerError(false);
  }, [bannerConfig.value, bannerConfig.type]);

  const renderBanner = () => {
    if (bannerError) {
      return (
        <div className={cn("w-full h-24 bg-[#1B1A18] flex flex-col items-center justify-center text-zinc-500", isPreview && "h-16")}>
          <div className="text-center p-4">
            <div className="text-[18px] mb-1 opacity-50">🖼️</div>
            <div className="text-[10px] font-medium uppercase tracking-widest" style={{ fontFamily: 'JetBrains Mono' }}>Banner Expired</div>
            <div className="text-[9px] mt-1 opacity-40">Refresh or re-upload image</div>
          </div>
        </div>
      );
    }

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
              onError={() => setBannerError(true)}
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
        "w-full max-w-md flex flex-col items-center z-10 gap-4 font-jakarta relative",
        isPreview && "gap-2"
      )}
    >
      {/* Spotlight Effect */}
      <div className="absolute inset-0 -z-10 pointer-events-none" style={{ background: 'radial-gradient(circle, #131312 0%, #0B0B0A 100%)' }} />

      {/* Profile header */}
      <Card
        className={cn(
          "w-full border-social-line shadow-none overflow-hidden",
          isPreview && "border-none"
        )}
        style={{ backgroundColor: 'var(--social-raised, #0F0F0E)', borderRadius: '12px' }}
      >
        {renderBanner()}

        <CardContent className={cn("p-6 relative text-center", isPreview && "p-3")}>
          <Avatar
            className={cn(
              "w-24 h-24 border-4 absolute -top-12 left-1/2 -translate-x-1/2 shadow-none",
              isPreview && "w-16 h-16 -top-8"
            )}
            style={{ borderRadius: '12px', borderColor: 'var(--social-raised, #0F0F0E)' }}
          >
            <AvatarImage
              src={profileImage || "/placeholder.svg"}
              alt={displayName}
            />
            <AvatarFallback
              className={cn(
                "text-2xl font-medium bg-[#D4A652] text-[#0B0B0A]",
                isPreview && "text-lg"
              )}
            >
              {typeof displayName === "string"
                ? displayName.charAt(0).toUpperCase()
                : "?"}
            </AvatarFallback>
          </Avatar>

          <div className={cn("mt-12 flex flex-col items-center", isPreview && "mt-8")}>
            <h1
              className={cn(
                "flex items-center justify-center gap-2 uppercase text-[10px] mb-1",
                isPreview && "text-[9px]"
              )}
              style={{ fontFamily: 'JetBrains Mono', letterSpacing: '0.08em', color: '#5F5E5A' }}
            >
              @{displayName}
              <Badge
                variant="outline"
                className="px-2 py-0 uppercase"
                style={{ fontFamily: 'JetBrains Mono', letterSpacing: '0.08em', color: '#5F5E5A', fontSize: '9px', borderRadius: '4px', backgroundColor: 'transparent', borderColor: '#5F5E5A' }}
              >
                SOCIAL
              </Badge>
            </h1>
            {hasBio && (
              <p
                className={cn(
                  "text-sm mt-2 text-[#B5B2A8] font-jakarta",
                  isPreview && "text-[11px]"
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
                "absolute top-6 right-6 w-10 h-10 hover:bg-social-raised shadow-none",
                showNotification && "bg-social-raised"
              )}
              style={{ backgroundColor: 'var(--social-well, #1B1A18)', borderRadius: '7px', borderColor: showNotification ? '#D4A652' : 'var(--social-line, transparent)' }}
              aria-label="Show notifications"
            >
              <Bell className="w-5 h-5 text-social-muted transition-colors" style={{ transitionTimingFunction: "cubic-bezier(0.16, 1, 0.3, 1)", transitionDuration: "300ms" }} />
              <span className="absolute -top-1 -right-1 w-4 h-4 rounded-[4px] text-[9px] flex items-center justify-center" style={{ fontFamily: 'JetBrains Mono', backgroundColor: '#D4A652', color: '#0B0B0A' }}>
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
      <motion.div 
        className={cn("w-full space-y-3", isPreview && "space-y-2")}
        initial="hidden"
        whileInView="show"
        viewport={{ once: false }}
        variants={{
          hidden: {},
          show: {
            transition: {
              staggerChildren: 0.08
            }
          }
        }}
      >
        {links && links.length > 0 ? (
          links.map((link, i) => (
            <motion.a
              variants={{
                hidden: { opacity: 0, y: 10 },
                show: { opacity: 1, y: 0, transition: { ease: [0.16, 1, 0.3, 1], duration: 0.5 } }
              }}
              whileHover={{ scale: 1.02, borderColor: '#D4A652' }}
              key={i}
              href={link.url}
              target="_blank"
              rel="noopener noreferrer"
              className={cn(
                "flex items-center gap-3 px-5 py-4 text-[#EAE9E5] transition-all w-full border border-transparent group",
                isPreview && "px-3 py-2 gap-2"
              )}
              style={{ backgroundColor: 'var(--social-well, #1B1A18)', borderRadius: '12px', transitionTimingFunction: "cubic-bezier(0.16, 1, 0.3, 1)", transitionDuration: "300ms" }}
            >
              <div
                className={cn(
                  "w-10 h-10 flex items-center justify-center transition-colors",
                  isPreview && "w-8 h-8"
                )}
                style={{ backgroundColor: 'var(--social-raised, #0F0F0E)', borderRadius: '50%', transitionTimingFunction: "cubic-bezier(0.16, 1, 0.3, 1)", transitionDuration: "300ms" }}
              >
                <div className="text-social-muted transition-colors" style={{ transitionTimingFunction: "cubic-bezier(0.16, 1, 0.3, 1)", transitionDuration: "300ms" }}>
                  {getPlatformIcon(link.platform, isPreview)}
                </div>
              </div>
              <div className="flex-1 overflow-hidden">
                <span className={cn("font-medium text-sm", isPreview && "text-[11px]")} style={{ fontFamily: 'Plus Jakarta Sans' }}>
                  {link.title && link.title.trim() !== ""
                    ? link.title
                    : link.platform.charAt(0).toUpperCase() +
                      link.platform.slice(1)}
                </span>
                <p
                  className={cn(
                    "text-[10px] text-social-muted uppercase truncate mt-0.5",
                    isPreview && "hidden"
                  )}
                  style={{ fontFamily: 'JetBrains Mono', letterSpacing: '0.05em' }}
                >
                  {link.url}
                </p>
              </div>
              <ExternalLink
                className={cn(
                  "w-5 h-5 text-social-muted transition-colors",
                  isPreview && "w-4 h-4"
                )}
                style={{ transitionTimingFunction: "cubic-bezier(0.16, 1, 0.3, 1)", transitionDuration: "300ms" }}
              />
            </motion.a>
          ))
        ) : (
          <Card
            className={cn(
              "w-full border-social-line shadow-none text-center py-8",
              isPreview && "py-4"
            )}
            style={{ backgroundColor: 'var(--social-raised, #0F0F0E)', borderRadius: '12px' }}
          >
            <div
              className={cn(
                "w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4",
                isPreview && "w-12 h-12 mb-2"
              )}
              style={{ backgroundColor: 'var(--social-well, #1B1A18)' }}
            >
              <span className={cn("text-2xl", isPreview && "text-[18px]")}>✨</span>
            </div>
            <p className={cn("text-social-muted text-[10px] uppercase", isPreview && "text-[9px]")} style={{ fontFamily: 'JetBrains Mono', letterSpacing: '0.08em' }}>
              No links added yet
            </p>
          </Card>
        )}
      </motion.div>
    </div>
  );
}
