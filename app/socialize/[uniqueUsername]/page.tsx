"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { getPlatformIcon } from "@/components/dashboard/Socialize/SocializeIcons";
import { Bell } from "lucide-react";

interface UserData {
  username?: string;
  bio?: string;
  links?: { platform: string; url: string }[];
  profileImage?: string;
  notifications?: { message: string; duration: number }[];
}

export default function PublicProfile() {
  const { uniqueUsername } = useParams();
  const [userData, setUserData] = useState<UserData | null>(null);
  const [loading, setLoading] = useState(true);
  const [showNotification, setShowNotification] = useState(false);
  const notificationTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    async function fetchUserData() {
      try {
        const res = await fetch(
          `/api/socialize?uniqueUsername=${uniqueUsername}`
        );
        const data = await res.json();
        if (res.ok) {
          setUserData(data);
        } else {
          console.error(data.error);
        }
      } catch (err) {
        console.error("Error loading user:", err);
      } finally {
        setLoading(false);
      }
    }

    if (uniqueUsername) fetchUserData();
  }, [uniqueUsername]);

  const handleNotificationClick = () => {
    // Clear any existing timeout
    if (notificationTimeoutRef.current) {
      clearTimeout(notificationTimeoutRef.current);
    }

    setShowNotification(true);

    // Auto-close after 5 seconds
    notificationTimeoutRef.current = setTimeout(() => {
      setShowNotification(false);
    }, 5000);
  };

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (notificationTimeoutRef.current) {
        clearTimeout(notificationTimeoutRef.current);
      }
    };
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0e1117] flex items-center justify-center relative overflow-hidden">
        {/* Blue gradient background */}
        <div
          className="fixed inset-0 -left-1/8 -top-20 z-[0] pointer-events-none
          bg-[radial-gradient(ellipse_at_top,_#0e6b9c_2%,_#0e6b9c_2%,_transparent_60%)]
          w-full h-[100vh] transition-all duration-700"
        />

        <div className="w-16 h-16 border-t-4 border-b-4 border-[#0e6b9c] rounded-full animate-spin z-10"></div>
      </div>
    );
  }

  if (!userData) {
    return (
      <div className="min-h-screen bg-[#0e1117] flex items-center justify-center p-4 relative overflow-hidden">
        {/* Blue gradient background */}
        <div
          className="fixed inset-0 -left-1/8 -top-20 z-[0] pointer-events-none
          bg-[radial-gradient(ellipse_at_top,_#0e6b9c_2%,_#0e6b9c_2%,_transparent_60%)]
          w-full h-[100vh] transition-all duration-700"
        />

        <div className="text-white text-center z-10 bg-[#1a1a1f]/50 p-8 rounded-xl backdrop-blur-sm border border-[#2a2a35]">
          <div className="w-20 h-20 bg-[#1a1a1f] rounded-full flex items-center justify-center mx-auto mb-4 shadow-lg shadow-[#0e6b9c]/20">
            <span className="text-3xl">🔍</span>
          </div>
          <h2 className="text-2xl font-bold mb-2">User Not Found</h2>
          <p className="text-gray-400">
            This profile doesn't exist or has been removed.
          </p>
          <button className="mt-6 px-4 py-2 bg-[#0e6b9c] hover:bg-[#0d5d87] rounded-full text-white font-medium transition-all">
            Go Back
          </button>
        </div>
      </div>
    );
  }

  const { username, bio, links, profileImage, notifications } = userData;
  const hasNotifications = notifications && notifications.length > 0;

  return (
    <div className="min-h-screen bg-[#0e1117] flex flex-col items-center justify-center p-4 relative overflow-hidden">
      {/* Blue gradient background */}
      <div
        className="fixed inset-0 -left-1/8 -top-20 z-[0] pointer-events-none
        bg-[radial-gradient(ellipse_at_top,_#0e6b9c_2%,_#0e6b9c_2%,_transparent_60%)]
        w-full h-[100vh] transition-all duration-700"
      />

      {/* Content */}
      <div className="w-full max-w-md flex flex-col items-center z-10">
        {/* Profile header with glass effect - now with notification button */}
        <div className="w-full bg-[#1a1a1f]/40 backdrop-blur-md rounded-xl mb-6 p-6 border border-[#2a2a35] shadow-xl relative">
          <div className="flex items-center gap-4">
            <div className="w-24 h-24 rounded-full overflow-hidden bg-gray-700 flex items-center justify-center border-4 border-[#0e6b9c] shadow-lg">
              {profileImage ? (
                <img
                  src={profileImage}
                  alt={username || "Profile"}
                  className="w-full h-full object-cover"
                />
              ) : (
                <img
                  src="/blogs/blank_profile.png"
                  alt="Profile"
                  className="w-20 h-20 rounded-full"
                />
              )}
            </div>

            <div className="flex-1">
              <h1 className="text-white text-2xl font-bold mb-1 flex items-center">
                {username ? `@${username}` : "YouTubemmm"}
              </h1>
              <p className="text-gray-300 text-sm">
                {bio
                  ? bio.substring(0, 60) + (bio.length > 60 ? "..." : "")
                  : "YouTube's Official Channel helps you discover what's new & trending globally...."}
              </p>
            </div>
          </div>

          {/* Notification Button */}
          {hasNotifications && (
            <button
              onClick={handleNotificationClick}
              className="absolute bottom-4 left-4 w-10 h-10 bg-[#0e6b9c] hover:bg-[#0d5d87] rounded-full flex items-center justify-center shadow-lg shadow-[#0e6b9c]/20 transition-all"
              aria-label="Show notifications"
            >
              <Bell className="w-5 h-5 text-white" />
              <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full text-white text-xs flex items-center justify-center">
                {notifications.length}
              </span>
            </button>
          )}
        </div>

        {/* Notification popup - shows only when activated */}
        {hasNotifications && showNotification && (
          <div
            className="bg-[#1a1a1f]/60 w-full max-w-sm px-5 py-4 rounded-xl mb-6 backdrop-blur-sm border border-[#2a2a35] transform transition-all origin-bottom-left animate-slideIn relative"
            style={{
              animation: "slideIn 0.3s ease-out forwards",
            }}
          >
            <button
              onClick={() => setShowNotification(false)}
              className="absolute top-2 right-2 w-6 h-6 flex items-center justify-center rounded-full bg-[#23232a] text-gray-400 hover:text-white"
            >
              ✕
            </button>

            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-[#0e6b9c] rounded-full flex items-center justify-center shadow-lg shadow-[#0e6b9c]/20">
                <Bell className="w-5 h-5 text-white" />
              </div>
              <div>
                <p className="text-white text-sm font-medium">
                  {notifications[0].message}
                </p>
                <p className="text-gray-400 text-xs mt-1">Just now</p>
              </div>
            </div>

            {notifications.length > 1 && (
              <div className="mt-4 pt-3 border-t border-[#2a2a35]/50">
                <p className="text-xs text-gray-400">
                  +{notifications.length - 1} more notifications
                </p>
              </div>
            )}
          </div>
        )}

        {/* Full bio if longer */}
        {bio && bio.length > 60 && (
          <div className="bg-[#1a1a1f]/40 w-full max-w-sm px-5 py-4 rounded-xl mb-6 backdrop-blur-sm border border-[#2a2a35]">
            <p className="text-gray-300 text-sm">{bio}</p>
          </div>
        )}

        {/* Links */}
        <div className="w-full max-w-sm space-y-3 mb-8">
          {links && links.length > 0 ? (
            links.map((link, i) => (
              <a
                key={i}
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-3 px-5 py-4 bg-[#1a1a1f]/60 hover:bg-[#23232a]/80 text-white rounded-xl transition-all w-full backdrop-blur-sm border border-[#2a2a35] transform hover:translate-y-[-2px] hover:shadow-lg"
              >
                <div className="w-10 h-10 rounded-full bg-[#23232a] flex items-center justify-center">
                  {getPlatformIcon(link.platform)}
                </div>
                <div className="flex-1">
                  <span className="font-medium">{link.platform}</span>
                  <p className="text-xs text-gray-400 truncate">{link.url}</p>
                </div>
                <div className="text-gray-400">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-5 w-5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M14 5l7 7m0 0l-7 7m7-7H3"
                    />
                  </svg>
                </div>
              </a>
            ))
          ) : (
            <div className="text-center py-8 bg-[#1a1a1f]/40 rounded-xl backdrop-blur-sm border border-[#2a2a35]">
              <div className="w-16 h-16 bg-[#0e6b9c]/20 rounded-full flex items-center justify-center mx-auto mb-4">
                <span className="text-2xl">✨</span>
              </div>
              <p className="text-gray-400">No links added yet</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-center gap-3 text-sm bg-[#1a1a1f]/40 px-6 py-3 rounded-full backdrop-blur-sm">
          <span className="text-white opacity-70">Powered by</span>
          <span className="text-white font-bold bg-gradient-to-r from-[#0e6b9c] to-[#42a5f5] bg-clip-text text-transparent">
            Socialize
          </span>
        </div>
      </div>
    </div>
  );
}
