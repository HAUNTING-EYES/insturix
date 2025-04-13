"use client";

import { useState, useRef, useEffect } from "react";
import Image from "next/image";
import { ChevronDown, LogOut, Settings } from "lucide-react";
import { useUser, useClerk } from "@clerk/nextjs";
import { useQuery } from "@tanstack/react-query";
import NotSignedIn from "../NotSignedup";

// User type interface from MongoDB
interface Payment {
  date: Date;
  time: string;
  amount: number;
  payment_id: string;
  phone_number: string;
}

interface UserData {
  id: string;
  clerkUserId: string;
  email: string;
  userType: string;
  payments: Payment[];
}

// API function to fetch user data
const fetchUserData = async (): Promise<UserData> => {
  const response = await fetch("/api/user");
  if (!response.ok) {
    throw new Error("Failed to fetch user data");
  }
  return response.json();
};

export default function UserDropdown({
  onSettingsClick,
  onUpgradeClick,
}: {
  onSettingsClick: () => void;
  onUpgradeClick: () => void;
}) {
  const { user } = useUser();
  const { signOut } = useClerk();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Use React Query to fetch user data
  const { data: userData, isLoading } = useQuery({
    queryKey: ["userData", user?.id],
    queryFn: fetchUserData,
    enabled: !!user, // Only run query if user is logged in
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  // Handle click outside to close dropdown
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  const toggleDropdown = () => {
    setIsOpen(!isOpen);
  };

  const handleSignOut = () => {
    signOut();
    setIsOpen(false);
  };

  const handleSettingsClick = () => {
    onSettingsClick();
    setIsOpen(false);
  };

  const handleUpgradeClick = () => {
    onUpgradeClick();
    setIsOpen(false);
  };

  if (!user) return <NotSignedIn />;

  return (
    <div className="relative w-full" ref={dropdownRef}>
      {/* Dropdown Trigger Button */}
      <button
        onClick={toggleDropdown}
        className="flex items-center justify-between w-full overflow-hidden p-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 transition-colors text-white"
      >
        <div className="flex items-center gap-2">
          <div className="relative w-8 h-8 overflow-hidden rounded-md">
            {user.imageUrl ? (
              <Image
                src={user.imageUrl}
                alt={user.fullName || ""}
                width={32}
                height={32}
                className="object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-zinc-700 text-white">
                {user.firstName?.charAt(0) || user.username?.charAt(0)}
              </div>
            )}
          </div>
          <div className="text-left">
            <p className="text-sm font-medium truncate max-w-[140px]">
              {user.username}
            </p>
            <p className="text-xs text-zinc-400 truncate max-w-[140px]">
              {isLoading ? "Loading..." : userData?.userType}
            </p>
          </div>
        </div>
        <ChevronDown
          className={`w-4 h-4 transition-transform duration-300 ease-in-out ${
            isOpen ? "rotate-180" : "rotate-0"
          }`}
        />
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div className="absolute bottom-full left-0 mb-2 w-full bg-zinc-900 border border-white/10 rounded-lg overflow-hidden shadow-lg z-10 transition-all duration-200 ease-in-out">
          <div className="p-3 text-white">
            <div className="space-y-2 mb-3">
              {/* User info with type */}
              <div className="px-3 py-2 mb-2">
                <p className="text-sm text-white">
                  {user.primaryEmailAddress?.emailAddress}
                </p>
              </div>

              <button
                onClick={handleSettingsClick}
                className="w-full flex items-center gap-2 p-2 rounded-md text-left text-white hover:bg-white/10 transition-colors"
              >
                <Settings className="w-4 h-4" />
                <span className="text-sm">Settings</span>
              </button>

              <button
                onClick={handleSignOut}
                className="w-full flex items-center gap-2 p-2 rounded-md text-left text-white hover:bg-white/10 transition-colors"
              >
                <LogOut className="w-4 h-4 text-red-600" />
                <span className="text-sm text-red-600">Sign Out</span>
              </button>
            </div>

            <div className="border-t border-white/10 pt-3">
              <div className="text-xs text-zinc-400 mb-2 px-3">Preferences</div>

              <div className="space-y-2">
                <div className="flex items-center justify-between p-2">
                  <div className="text-sm text-white">Theme</div>
                  <div className="flex bg-zinc-800 rounded-full p-1">
                    <button
                      className="p-1 rounded-md bg-transparent"
                      title="Light Theme"
                    >
                      <svg
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        xmlns="http://www.w3.org/2000/svg"
                      >
                        <rect
                          x="3"
                          y="3"
                          width="18"
                          height="18"
                          rx="2"
                          stroke="white"
                          strokeWidth="2"
                        />
                      </svg>
                    </button>
                    <button
                      className="p-1 rounded-md bg-transparent"
                      title="Dark Theme"
                    >
                      <svg
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        xmlns="http://www.w3.org/2000/svg"
                      >
                        <circle
                          cx="12"
                          cy="12"
                          r="5"
                          stroke="white"
                          strokeWidth="2"
                        />
                        <path
                          d="M12 2V4"
                          stroke="white"
                          strokeWidth="2"
                          strokeLinecap="round"
                        />
                        <path
                          d="M12 20V22"
                          stroke="white"
                          strokeWidth="2"
                          strokeLinecap="round"
                        />
                        <path
                          d="M4 12L2 12"
                          stroke="white"
                          strokeWidth="2"
                          strokeLinecap="round"
                        />
                        <path
                          d="M22 12L20 12"
                          stroke="white"
                          strokeWidth="2"
                          strokeLinecap="round"
                        />
                        <path
                          d="M19.7782 4.22183L18.364 5.63604"
                          stroke="white"
                          strokeWidth="2"
                          strokeLinecap="round"
                        />
                        <path
                          d="M5.63608 18.364L4.22187 19.7782"
                          stroke="white"
                          strokeWidth="2"
                          strokeLinecap="round"
                        />
                        <path
                          d="M19.7782 19.7782L18.364 18.364"
                          stroke="white"
                          strokeWidth="2"
                          strokeLinecap="round"
                        />
                        <path
                          d="M5.63608 5.63604L4.22187 4.22183"
                          stroke="white"
                          strokeWidth="2"
                          strokeLinecap="round"
                        />
                      </svg>
                    </button>
                    <button
                      className="p-1 rounded-full bg-zinc-700"
                      title="Auto Theme"
                      type="button"
                    >
                      <svg
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        xmlns="http://www.w3.org/2000/svg"
                      >
                        <path
                          d="M21.9548 13.9286C21.5126 17.5686 18.6687 20.5714 15.0001 20.5714C10.6364 20.5714 7.00012 16.9351 7.00012 12.5714C7.00012 8.90283 9.86155 5.91855 13.5001 5.47635C13.1277 6.3083 12.9287 7.22185 12.9287 8.17857C12.9287 12.5423 16.5649 16.1786 21.0001 16.1786C21.3279 16.1786 21.6467 16.1558 21.9548 16.1121C21.9848 16.1008 21.9848 16.0421 21.9548 13.9286Z"
                          stroke="white"
                          strokeWidth="2"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="p-3 bg-zinc-900 border-t border-white/10">
            <button
              onClick={handleUpgradeClick}
              className="w-full py-2 bg-white hover:bg-gray-100 rounded-md text-zinc-900 font-medium text-sm transition-colors"
              type="button"
            >
              Upgrade Plan
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
