"use client";

import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Bell, ExternalLink } from "lucide-react";
import { getPlatformIcon } from "@/components/dashboard/Socialize/SocializeIcons";
import { ProfileError } from "@/components/dashboard/Socialize/ProfileError";
import { NotificationPanel } from "@/components/dashboard/Socialize/NotificationPanel";
import { fetchSocializeUser } from "@/lib/socialize/main";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { ProfileSkeleton } from "@/components/skeletons/ProfileSkeleton";

export function ProfileContent({ uniqueUsername }: { uniqueUsername: string }) {
  const [showNotification, setShowNotification] = useState(false);

  // Use React Query to fetch and cache Socialize user data
  const {
    data: socializeData,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["socializeUser", uniqueUsername],
    queryFn: () => fetchSocializeUser(uniqueUsername),
    staleTime: 1000 * 60 * 5, // 5 minutes
    retry: 1,
  });

  // Auto-close notification after 5 seconds
  useEffect(() => {
    let timeout: NodeJS.Timeout;
    if (showNotification) {
      timeout = setTimeout(() => {
        setShowNotification(false);
      }, 5000);
    }
    return () => clearTimeout(timeout);
  }, [showNotification]);

  if (isLoading) return <ProfileSkeleton />;
  if (error || !socializeData) return <ProfileError />;

  // Extract profile data from the Socialize response
  const {
    username,
    bio,
    links = [],
    notifications = [],
    profileImage,
  } = socializeData;
  const displayName = username || uniqueUsername;
  const hasNotifications = notifications && notifications.length > 0;
  const hasBio = bio && bio.length > 0;

  return (
    <div className="w-full max-w-md flex flex-col items-center z-10 gap-4">
      {/* Profile header with enhanced design */}
      <Card className="w-full bg-[#1a1a1f] border-[#2a2a35] shadow-xl overflow-hidden">
        <div className="h-24 bg-[#23232a]"></div>
        <CardContent className="p-6 relative">
          <Avatar className="w-24 h-24 border-4 border-[#1a1a1f] absolute -top-12 left-6 shadow-lg">
            <AvatarImage
              src={profileImage || "/placeholder.svg"}
              alt={displayName}
            />
            <AvatarFallback className="bg-[#0e6b9c] text-white text-2xl font-bold">
              {typeof displayName === "string"
                ? displayName.charAt(0).toUpperCase()
                : "?"}
            </AvatarFallback>
          </Avatar>

          <div className="mt-12">
            <h1 className="text-white text-2xl font-bold mb-1 flex items-center gap-2">
              @{displayName}
              <Badge
                variant="outline"
                className="bg-[#0e6b9c] text-white border-[#0e6b9c] text-xs"
              >
                Socialize
              </Badge>
            </h1>
            {hasBio && <p className="text-gray-300 text-sm mt-2">{bio}</p>}
          </div>

          {/* Notification Button */}
          {hasNotifications && (
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
                {notifications.length}
              </span>
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Notification panel */}
      {hasNotifications && showNotification && (
        <NotificationPanel
          notifications={notifications}
          onClose={() => setShowNotification(false)}
        />
      )}

      {/* Social Links with improved design */}
      <div className="w-full space-y-3">
        {links && links.length > 0 ? (
          links.map((link, i) => (
            <a
              key={i}
              href={link.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 px-5 py-4 bg-[#1a1a1f] hover:bg-[#23232a] text-white rounded-xl transition-all w-full border border-[#2a2a35] transform hover:translate-y-[-2px] hover:shadow-lg group"
            >
              <div className="w-10 h-10 rounded-full bg-[#23232a] flex items-center justify-center group-hover:bg-[#0e6b9c] transition-colors">
                {getPlatformIcon(link.platform)}
              </div>
              <div className="flex-1 overflow-hidden">
                <span className="font-medium">{link.platform}</span>
                <p className="text-xs text-gray-400 truncate">{link.url}</p>
              </div>
              <ExternalLink className="w-5 h-5 text-gray-400 group-hover:text-white transition-colors" />
            </a>
          ))
        ) : (
          <Card className="w-full bg-[#1a1a1f] border-[#2a2a35] text-center py-8">
            <div className="w-16 h-16 bg-[#23232a] rounded-full flex items-center justify-center mx-auto mb-4">
              <span className="text-2xl">✨</span>
            </div>
            <p className="text-gray-400">No social links added yet</p>
          </Card>
        )}
      </div>
    </div>
  );
}
