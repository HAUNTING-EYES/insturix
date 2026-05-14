"use client";

import { useState, useEffect } from "react";
import { Bell, ExternalLink, ChevronLeft, ChevronRight, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { getPlatformIcon } from "@/components/dashboard/Socialize/SocializeIcons";
import { SocializeUser } from "@/lib/socialize/main";
import type { BannerConfig } from "@/schemas/Socialize";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { isNotificationExpired } from "@/lib/utils/notification";
import { cn } from "@/lib/utils";

const PLATFORM_COLORS: Record<string, string> = {
  youtube: "#FF0000",
  instagram: "#E4405F",
  twitter: "#1DA1F2",
  x: "#1DA1F2",
  facebook: "#1877F2",
  linkedin: "#0A66C2",
  github: "#E6EDF3",
  tiktok: "#00F2EA",
  spotify: "#1DB954",
  twitch: "#9146FF",
  discord: "#5865F2",
  reddit: "#FF4500",
  snapchat: "#FFFC00",
  dribbble: "#EA4C89",
  figma: "#F24E1E",
  codepen: "#E6EDF3",
  slack: "#611F69",
  mail: "#D4A652",
  globe: "#D4A652",
  music: "#D4A652",
};

const ACCENT_PALETTE: Record<string, string> = {
  gold: "#D4A652",
  cyan: "#5CB8CC",
  rose: "#D088B4",
  green: "#5EC97E",
  purple: "#9088D4",
  coral: "#D46A5C",
};

function getPlatformColor(platform: string): string {
  return PLATFORM_COLORS[platform.toLowerCase()] || "#D4A652";
}

function getAccentHex(name?: string): string {
  return ACCENT_PALETTE[name || "gold"] || ACCENT_PALETTE.gold;
}

interface ProfileContentProps {
  socializeData: SocializeUser;
  uniqueUsername: string;
  isPreview?: boolean;
}

const EASE = [0.16, 1, 0.3, 1] as const;

export function ProfileContent({
  socializeData,
  uniqueUsername,
  isPreview = false,
}: ProfileContentProps) {
  const [notifIndex, setNotifIndex] = useState(0);
  const [notifDismissed, setNotifDismissed] = useState(false);
  const [bannerError, setBannerError] = useState(false);

  const {
    username,
    bio,
    links = [],
    notifications = [],
    profileImage,
    banner,
    status,
    accentColor,
  } = socializeData;

  const accent = getAccentHex(accentColor);
  const displayName = username || uniqueUsername;
  const hasBio = bio && bio.trim().length > 0;
  const hasStatus = status && status.trim().length > 0;

  const validNotifications = Array.isArray(notifications)
    ? notifications.filter(
        (n) => n && typeof n === "object" && !isNotificationExpired(n)
      )
    : [];
  const showNotif = validNotifications.length > 0 && !notifDismissed;

  useEffect(() => {
    if (validNotifications.length <= 1) return;
    const interval = setInterval(() => {
      setNotifIndex((prev) => (prev + 1) % validNotifications.length);
    }, 5000);
    return () => clearInterval(interval);
  }, [validNotifications.length]);

  useEffect(() => {
    setBannerError(false);
  }, [banner?.value, banner?.type]);

  const defaultBanner: BannerConfig = {
    type: "color",
    value: accent,
    gradientType: "linear",
    gradientColors: [],
  };
  const bannerConfig = banner || defaultBanner;

  const featuredLink = links[0] || null;
  const regularLinks = links.slice(1);

  const containerVariants = {
    hidden: {},
    show: {
      transition: { staggerChildren: 0.06, delayChildren: isPreview ? 0 : 0.3 },
    },
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 16 },
    show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: EASE } },
  };

  const heroVariants = {
    hidden: { opacity: 0, y: 20 },
    show: { opacity: 1, y: 0, transition: { duration: 0.6, ease: EASE } },
  };

  function createGradientCSS(
    colors: Array<{ color: string; position: number }>,
    type: string
  ) {
    const stops = colors.map((c) => `${c.color} ${c.position}%`).join(", ");
    return type === "radial"
      ? `radial-gradient(circle, ${stops})`
      : `linear-gradient(135deg, ${stops})`;
  }

  function renderBanner() {
    if (bannerError) {
      return (
        <div
          className="w-full h-full flex flex-col items-center justify-center"
          style={{ backgroundColor: "#1B1A18" }}
        >
          <div className="text-lg mb-1 opacity-40">🖼️</div>
          <div
            className="text-[10px] font-medium uppercase"
            style={{
              fontFamily: "JetBrains Mono",
              letterSpacing: "0.08em",
              color: "#5F5E5A",
            }}
          >
            Banner Expired
          </div>
        </div>
      );
    }
    switch (bannerConfig.type) {
      case "image":
        return (
          <img
            src={bannerConfig.value}
            alt="Profile banner"
            className="w-full h-full object-cover"
            onError={() => setBannerError(true)}
          />
        );
      case "color":
        return (
          <div
            className="w-full h-full"
            style={{ backgroundColor: bannerConfig.value }}
          />
        );
      case "gradient":
        return (
          <div
            className="w-full h-full"
            style={{
              background:
                bannerConfig.gradientColors &&
                bannerConfig.gradientColors.length > 0
                  ? createGradientCSS(
                      bannerConfig.gradientColors,
                      bannerConfig.gradientType || "linear"
                    )
                  : `linear-gradient(135deg, ${accent}80 0%, ${accent}20 100%)`,
            }}
          />
        );
      default:
        return (
          <div
            className="w-full h-full"
            style={{ backgroundColor: "#1B1A18" }}
          />
        );
    }
  }

  return (
    <div
      className={cn(
        "relative w-full flex flex-col items-center",
        isPreview ? "max-w-full" : "max-w-lg mx-auto"
      )}
      style={{ fontFamily: "Plus Jakarta Sans, sans-serif" }}
    >
      {!isPreview && (
        <style>{`
          @keyframes socialize-breathe {
            0%, 100% { box-shadow: 0 0 0 0 ${accent}66; }
            50% { box-shadow: 0 0 0 6px ${accent}00; }
          }
          @keyframes socialize-mesh {
            0% { transform: translate(0, 0); }
            33% { transform: translate(10px, -10px); }
            66% { transform: translate(-5px, 5px); }
            100% { transform: translate(0, 0); }
          }
        `}</style>
      )}

      {/* Mesh gradient background */}
      {!isPreview && (
        <div
          className="fixed inset-0 -z-10 pointer-events-none overflow-hidden"
          style={{ backgroundColor: "#0B0B0A" }}
        >
          <div
            className="absolute w-[600px] h-[600px] rounded-full opacity-[0.04]"
            style={{
              background: `radial-gradient(circle, ${accent}, transparent 70%)`,
              top: "10%",
              left: "15%",
              animation: "socialize-mesh 20s ease-in-out infinite",
            }}
          />
          <div
            className="absolute w-[500px] h-[500px] rounded-full opacity-[0.03]"
            style={{
              background: `radial-gradient(circle, ${accent}, transparent 70%)`,
              bottom: "10%",
              right: "10%",
              animation: "socialize-mesh 25s ease-in-out infinite reverse",
            }}
          />
        </div>
      )}

      {/* Hero */}
      <motion.div
        className="w-full"
        variants={isPreview ? undefined : heroVariants}
        initial={isPreview ? false : "hidden"}
        animate="show"
      >
        {/* Banner */}
        <div
          className={cn(
            "w-full overflow-hidden relative",
            isPreview ? "h-20 rounded-t-xl" : "h-40 sm:h-48 rounded-t-2xl"
          )}
        >
          {renderBanner()}
          <div
            className="absolute bottom-0 left-0 right-0"
            style={{
              height: isPreview ? "40px" : "80px",
              background: isPreview
                ? "linear-gradient(to top, #13131a, transparent)"
                : "linear-gradient(to top, #0B0B0A, transparent)",
            }}
          />
        </div>

        {/* Avatar */}
        <div
          className={cn("flex justify-center", isPreview ? "-mt-7" : "-mt-11")}
        >
          <div
            className="relative rounded-full"
            style={{
              animation: !isPreview
                ? "socialize-breathe 3s ease-in-out infinite"
                : undefined,
            }}
          >
            <Avatar
              className={cn(
                "border-[3px]",
                isPreview ? "w-14 h-14" : "w-[88px] h-[88px]"
              )}
              style={{ borderColor: accent }}
            >
              <AvatarImage
                src={profileImage || "/placeholder.svg"}
                alt={displayName}
              />
              <AvatarFallback
                className={cn(
                  "font-bold",
                  isPreview ? "text-lg" : "text-2xl"
                )}
                style={{ backgroundColor: accent, color: "#0B0B0A" }}
              >
                {typeof displayName === "string"
                  ? displayName.charAt(0).toUpperCase()
                  : "?"}
              </AvatarFallback>
            </Avatar>
          </div>
        </div>

        {/* Name + Bio + Status */}
        <div
          className={cn("text-center px-6", isPreview ? "mt-2" : "mt-4")}
        >
          <h1
            className={cn(
              "font-extrabold tracking-tight",
              isPreview ? "text-base" : "text-2xl sm:text-3xl"
            )}
            style={{ color: "#ECE9E1" }}
          >
            {displayName}
          </h1>

          {hasBio && (
            <p
              className={cn(
                "mt-1.5 leading-relaxed",
                isPreview ? "text-[11px]" : "text-sm"
              )}
              style={{ color: "#B5B2A8" }}
            >
              {bio}
            </p>
          )}

          {hasStatus && (
            <div
              className={cn(
                "inline-flex items-center gap-1.5 mt-3 rounded-full",
                isPreview ? "px-2 py-0.5 text-[9px]" : "px-3 py-1 text-xs"
              )}
              style={{
                backgroundColor: `${accent}14`,
                color: accent,
                fontFamily: "JetBrains Mono",
                fontWeight: 500,
              }}
            >
              <span
                className={cn(
                  "rounded-full flex-shrink-0",
                  isPreview ? "w-1 h-1" : "w-1.5 h-1.5"
                )}
                style={{ backgroundColor: accent }}
              />
              {status}
            </div>
          )}
        </div>
      </motion.div>

      {/* Notification toast */}
      <AnimatePresence>
        {showNotif && (
          <motion.div
            className="w-full px-4 mt-6"
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.3, ease: EASE }}
          >
            <div
              className="flex items-center gap-3 px-4 py-3 rounded-xl"
              style={{
                backgroundColor: "#0F0F0E",
                borderLeft: `3px solid ${accent}`,
              }}
            >
              <Bell
                className="w-4 h-4 flex-shrink-0"
                style={{ color: accent }}
              />
              <p className="flex-1 text-sm" style={{ color: "#ECE9E1" }}>
                {validNotifications[notifIndex]?.message}
              </p>
              {validNotifications.length > 1 && (
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button
                    onClick={() =>
                      setNotifIndex(
                        (prev) =>
                          (prev - 1 + validNotifications.length) %
                          validNotifications.length
                      )
                    }
                    className="p-0.5 rounded hover:bg-[#1B1A18] transition-colors"
                    aria-label="Previous notification"
                  >
                    <ChevronLeft
                      className="w-3.5 h-3.5"
                      style={{ color: "#7A776E" }}
                    />
                  </button>
                  <span
                    className="text-[10px] min-w-[24px] text-center"
                    style={{ color: "#5F5E5A", fontFamily: "JetBrains Mono" }}
                  >
                    {notifIndex + 1}/{validNotifications.length}
                  </span>
                  <button
                    onClick={() =>
                      setNotifIndex(
                        (prev) => (prev + 1) % validNotifications.length
                      )
                    }
                    className="p-0.5 rounded hover:bg-[#1B1A18] transition-colors"
                    aria-label="Next notification"
                  >
                    <ChevronRight
                      className="w-3.5 h-3.5"
                      style={{ color: "#7A776E" }}
                    />
                  </button>
                </div>
              )}
              <button
                onClick={() => setNotifDismissed(true)}
                className="p-0.5 rounded hover:bg-[#1B1A18] transition-colors flex-shrink-0"
                aria-label="Dismiss notification"
              >
                <X className="w-3.5 h-3.5" style={{ color: "#5F5E5A" }} />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Link grid */}
      {links.length > 0 ? (
        <motion.div
          className={cn(
            "w-full grid gap-3",
            isPreview
              ? "grid-cols-1 mt-3 px-0"
              : "grid-cols-1 sm:grid-cols-2 mt-6 px-4"
          )}
          variants={isPreview ? undefined : containerVariants}
          initial={isPreview ? false : "hidden"}
          animate="show"
        >
          {/* Featured link */}
          {featuredLink && (
            <motion.a
              variants={isPreview ? undefined : itemVariants}
              href={featuredLink.url}
              target="_blank"
              rel="noopener noreferrer"
              className={cn(
                "group relative overflow-hidden flex items-center rounded-xl",
                isPreview
                  ? "px-3 py-2.5 gap-3 col-span-1"
                  : "px-5 py-5 gap-4 col-span-1 sm:col-span-2"
              )}
              style={{
                backgroundColor: "#131312",
                borderLeft: `3px solid ${getPlatformColor(featuredLink.platform)}`,
                border: `1px solid ${getPlatformColor(featuredLink.platform)}30`,
              }}
              whileHover={
                !isPreview
                  ? {
                      y: -2,
                      scale: 1.01,
                      boxShadow: `0 0 24px ${getPlatformColor(featuredLink.platform)}18, 0 4px 16px rgba(0,0,0,0.3)`,
                      borderColor: `${getPlatformColor(featuredLink.platform)}30`,
                    }
                  : undefined
              }
              transition={{ duration: 0.3, ease: EASE }}
            >
              {/* Platform accent line */}
              <div
                className="absolute top-0 left-0 right-0 h-[2px]"
                style={{
                  background: `linear-gradient(90deg, ${getPlatformColor(featuredLink.platform)}, ${getPlatformColor(featuredLink.platform)}00)`,
                }}
              />
              <div
                className={cn(
                  "flex items-center justify-center rounded-full flex-shrink-0",
                  isPreview ? "w-8 h-8" : "w-11 h-11"
                )}
                style={{
                  backgroundColor: `${getPlatformColor(featuredLink.platform)}18`,
                  border: `1px solid ${getPlatformColor(featuredLink.platform)}25`,
                }}
              >
                <div style={{ color: getPlatformColor(featuredLink.platform) }}>
                  {getPlatformIcon(featuredLink.platform, isPreview)}
                </div>
              </div>
              <div className="flex-1 min-w-0">
                <span
                  className={cn(
                    "font-semibold block",
                    isPreview ? "text-[11px]" : "text-[15px]"
                  )}
                  style={{ color: "#ECE9E1" }}
                >
                  {featuredLink.title?.trim() ||
                    featuredLink.platform.charAt(0).toUpperCase() +
                      featuredLink.platform.slice(1)}
                </span>
                {!isPreview && (
                  <p
                    className="text-[10px] truncate mt-0.5 uppercase"
                    style={{
                      color: "#5F5E5A",
                      fontFamily: "JetBrains Mono",
                      letterSpacing: "0.04em",
                    }}
                  >
                    {featuredLink.url
                      .replace(/^https?:\/\//, "")
                      .replace(/\/$/, "")}
                  </p>
                )}
              </div>
              <ExternalLink
                className={cn(
                  "flex-shrink-0 transition-colors",
                  isPreview ? "w-3.5 h-3.5" : "w-4 h-4"
                )}
                style={{ color: "#5F5E5A" }}
              />
            </motion.a>
          )}

          {/* Regular links */}
          {regularLinks.map((link, i) => (
            <motion.a
              key={i}
              variants={isPreview ? undefined : itemVariants}
              href={link.url}
              target="_blank"
              rel="noopener noreferrer"
              className={cn(
                "group relative overflow-hidden flex items-center gap-3 border border-transparent rounded-xl",
                isPreview ? "px-3 py-2" : "px-4 py-3.5"
              )}
              style={{ backgroundColor: "#131312" }}
              whileHover={
                !isPreview
                  ? {
                      y: -2,
                      scale: 1.02,
                      boxShadow: `0 0 20px ${getPlatformColor(link.platform)}18, 0 4px 12px rgba(0,0,0,0.2)`,
                      borderColor: `${getPlatformColor(link.platform)}30`,
                    }
                  : undefined
              }
              transition={{ duration: 0.3, ease: EASE }}
            >
              <div
                className={cn(
                  "flex items-center justify-center rounded-full flex-shrink-0",
                  isPreview ? "w-7 h-7" : "w-9 h-9"
                )}
                style={{
                  backgroundColor: `${getPlatformColor(link.platform)}14`,
                  border: `1px solid ${getPlatformColor(link.platform)}20`,
                }}
              >
                <div style={{ color: getPlatformColor(link.platform) }}>
                  {getPlatformIcon(link.platform, isPreview)}
                </div>
              </div>
              <div className="flex-1 min-w-0">
                <span
                  className={cn(
                    "font-medium block truncate",
                    isPreview ? "text-[10px]" : "text-sm"
                  )}
                  style={{ color: "#ECE9E1" }}
                >
                  {link.title?.trim() ||
                    link.platform.charAt(0).toUpperCase() +
                      link.platform.slice(1)}
                </span>
              </div>
              <ExternalLink
                className={cn(
                  "flex-shrink-0 transition-colors",
                  isPreview ? "w-3 h-3" : "w-4 h-4"
                )}
                style={{ color: "#454340" }}
              />
            </motion.a>
          ))}
        </motion.div>
      ) : (
        <motion.div
          className={cn("w-full", isPreview ? "mt-3 px-0" : "mt-6 px-4")}
          variants={isPreview ? undefined : itemVariants}
          initial={isPreview ? false : "hidden"}
          animate="show"
        >
          <div
            className={cn(
              "flex flex-col items-center justify-center rounded-xl border border-dashed",
              isPreview ? "py-6" : "py-10"
            )}
            style={{
              backgroundColor: "#0F0F0E",
              borderColor: "#282724",
            }}
          >
            <div
              className={cn(
                "rounded-full flex items-center justify-center mb-3",
                isPreview ? "w-10 h-10" : "w-14 h-14"
              )}
              style={{ backgroundColor: "#1B1A18" }}
            >
              <span className={cn(isPreview ? "text-lg" : "text-2xl")}>
                ✨
              </span>
            </div>
            <p
              className={cn("uppercase", isPreview ? "text-[8px]" : "text-[10px]")}
              style={{
                color: "#5F5E5A",
                fontFamily: "JetBrains Mono",
                letterSpacing: "0.08em",
              }}
            >
              No links added yet
            </p>
          </div>
        </motion.div>
      )}

      {/* Footer watermark */}
      {!isPreview && (
        <motion.div
          className="mt-8 mb-6 text-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1, duration: 0.5 }}
        >
          <span
            className="text-[10px]"
            style={{
              color: "#454340",
              fontFamily: "JetBrains Mono",
              letterSpacing: "0.04em",
            }}
          >
            Built with Insturix
          </span>
        </motion.div>
      )}
    </div>
  );
}
