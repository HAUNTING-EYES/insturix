"use client";

import { useEffect, useState } from "react";
import { useUser } from "@clerk/nextjs";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import { useToast } from "@/hooks/use-toast";
import { motion } from "framer-motion";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { SocializeHeader } from "./SocializeHeader";
import { SocializeShareBar } from "./SocializeShareBar";
import { SocializeAddLinkButton } from "./SocializeAddLinkButton";
import { SocializeNotificationCard } from "./SocializeNotificationCard";
import { SocializeLinksCard } from "./SocializeLinksCard";
import { SocializeLinkPreviewCard } from "./SocializeLinkPreviewCard";
import { Plus, Bell } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import type { SocializeLink, BannerConfig } from "@/schemas/Socialize";
import { BannerCustomizer } from "./BannerCustomizer";
import { getExpiresAtFromDuration, isNotificationExpired } from "@/lib/utils/notification";



// interface ISocialize {
//   clerkUserId: string;
//   username: string;
//   profileImage: string;
//   bio: string;
//   links: SocializeLink[];
//   banner?: BannerConfig;
//   uniqueUsername?: string;
//   notifications?: { message: string; duration: number }[];
//   createdAt: Date;
//   updatedAt: Date;
// }
// Add the necessary fields to the notification object type within ISocialize
interface ISocialize {
  clerkUserId: string;
  username: string;
  profileImage: string;
  bio: string;
  links: SocializeLink[];
  banner?: BannerConfig;
  uniqueUsername?: string;
  notifications?: { 
    message: string; 
    duration: number;
    // --- ADD THESE TWO FIELDS ---
    timestamp?: string; 
    expiresAt?: string;
    // ----------------------------
  }[];
  createdAt: Date;
  updatedAt: Date;
}

interface LinkPreview {
  title: string;
  description: string;
  image: string | null;
  url: string;
}

const api = axios.create({
  baseURL: "/api",
  headers: {
    "Content-Type": "application/json",
  },
  // Prevent long hangs on slow endpoints and avoid blocking initial paint
  timeout: 4000,
});

export default function SocializeDashboard({
  initialData,
}: {
  initialData: ISocialize | null;
}) {
  const { user } = useUser();
  const queryClient = useQueryClient();
  const uniqueUsername = user?.username || "";

  // State management and other hooks remain unchanged...
  const [showAddModal, setShowAddModal] = useState(false);
  const { toast } = useToast();
  const [showUpdatePopup, setShowUpdatePopup] = useState(false);
  const [newLink, setNewLink] = useState<SocializeLink>({
    platform: "youtube",
    url: "",
  });
  const [duration, setDuration] = useState<number | "">(1);
  const [message, setMessage] = useState("");
  const [selectedLinkIndex, setSelectedLinkIndex] = useState<number | null>(
    null
  );
  const [editingLink, setEditingLink] = useState<SocializeLink | null>(null);
  const [editingLinkIndex, setEditingLinkIndex] = useState<number | null>(null);
  const [showEditLinkModal, setShowEditLinkModal] = useState(false);
  const [bio, setBio] = useState("");
  const [showEditBioModal, setShowEditBioModal] = useState(false);
  const [links, setLinks] = useState<SocializeLink[]>(initialData?.links || []);
  const [banner, setBanner] = useState<BannerConfig>(
    initialData?.banner || {
      type: 'color',
      value: '#0e6b9c',
      gradientType: 'linear',
      gradientColors: []
    }
  );

  // Queries and mutations remain unchanged...

  // Auto-detect platform from URL
  function detectPlatformFromUrl(url: string): string {
    if (!url) return "website";
    const patterns: { [key: string]: RegExp } = {
      youtube: /(?:youtube\.com|youtu\.be)/i,
      instagram: /instagram\.com/i,
      tiktok: /tiktok\.com/i,
      twitter: /(?:twitter\.com|x\.com)/i,
      linkedin: /linkedin\.com/i,
      facebook: /facebook\.com/i,
      snapchat: /snapchat\.com/i,
      reddit: /reddit\.com/i,
      discord: /discord\.com/i,
      github: /github\.com/i,
      website: /^https?:\/\//i,
    };
    for (const [platform, regex] of Object.entries(patterns)) {
      if (regex.test(url)) return platform;
    }
    return "website";
  }
  const { data: userData } = useQuery({
    queryKey: ["userData", uniqueUsername],
    queryFn: async () => {
      if (!uniqueUsername) return null;

      const controller = new AbortController();
      const id = setTimeout(() => controller.abort(), 3900); // align with axios timeout
      try {
        const { data } = await api.get<ISocialize>(
          `/services/socialize?username=${uniqueUsername}`,
          { signal: controller.signal }
        );
        return data;
      } finally {
        clearTimeout(id);
      }
    },
    initialData: initialData,
    enabled: !initialData && !!uniqueUsername, // Only fetch if initialData is not present
    // Keep initial server data fresh for a short window to avoid jitter on quick switches
    staleTime: 30_000,
  });

  const { data: previewData, isLoading: isPreviewLoading } = useQuery({
    queryKey: [
      "linkPreview",
      selectedLinkIndex !== null
        ? userData?.links?.[selectedLinkIndex]?.url
        : null,
    ],
    queryFn: async () => {
      if (selectedLinkIndex === null || !userData?.links?.[selectedLinkIndex]) {
        return null;
      }
      const url = userData.links[selectedLinkIndex].url;

      // Skip fetching previews for obviously invalid/empty URLs
      if (!url || !/^https?:\/\/.+/i.test(url)) {
        return null;
      }

      const controller = new AbortController();
      const id = setTimeout(() => controller.abort(), 2900);
      try {
        const { data } = await api.get(
          `/link-preview?url=${encodeURIComponent(url)}`,
          { signal: controller.signal }
        );
        return data as LinkPreview;
      } finally {
        clearTimeout(id);
      }
    },
    enabled:
      selectedLinkIndex !== null && !!userData?.links?.[selectedLinkIndex],
    // Prevent rapid re-fetch loops when quickly switching links
    staleTime: 60_000,
    gcTime: 5 * 60_000,
  });

  const updateUserDataMutation = useMutation({
    mutationFn: async (data: Partial<ISocialize>) => {
      return api.patch("/services/socialize", {
        username: uniqueUsername,
        ...data,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["userData", uniqueUsername] });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Failed to update profile",
        variant: "destructive",
        duration: 4000,
      });
      console.error("Update error:", error);
    },
  });

  // Event handlers remain unchanged...
  const handleAddLink = async () => {
    if (!newLink.url.trim()) return;
    let url = newLink.url.trim();
    if (url && !/^https?:\/\//i.test(url)) {
      url = "https://" + url;
    }
    const updatedLinks = [...(links || []), { ...newLink, url }];
    updateUserDataMutation.mutate(
      { links: updatedLinks },
      {
        onSuccess: () => {
          setShowAddModal(false);
          setNewLink({ platform: "youtube", url: "", title: "" });
          toast({
            title: "Success",
            description: "Link added successfully",
            variant: "default",
            duration: 4000,
          });
        },
        onError: (error: any) => {
          const errorMsg =
            error?.response?.data?.error ||
            "Failed to add link. Please check your input.";
          toast({
            title: "Error",
            description: errorMsg,
            variant: "destructive",
            duration: 4000,
          });
        },
      }
    );
  };

  const handleRemoveLink = async (indexToRemove: number) => {
    if (!links) return;
    const updatedLinks = links.filter((_, index) => index !== indexToRemove);
    updateUserDataMutation.mutate(
      { links: updatedLinks },
      {
        onSuccess: () => {
          if (selectedLinkIndex === indexToRemove) {
            setSelectedLinkIndex(null);
          }
          toast({
            title: "Success",
            description: "Link removed",
            variant: "default",
            duration: 4000,
          });
        },
      }
    );
  };

  const handleEditLink = (index: number) => {
    if (!links) return;
    setEditingLink(links[index]);
    setEditingLinkIndex(index);
    setShowEditLinkModal(true);
  };

  const handleUpdateLink = async () => {
    if (!editingLink || editingLinkIndex === null) return;

    const updatedLinks = [...(links || [])];
    updatedLinks[editingLinkIndex] = editingLink;

    updateUserDataMutation.mutate(
      { links: updatedLinks },
      {
        onSuccess: () => {
          setShowEditLinkModal(false);
          setEditingLink(null);
          setEditingLinkIndex(null);
          toast({
            title: "Success",
            description: "Link updated successfully",
            variant: "default",
            duration: 4000,
          });
        },
      }
    );
  };

  const handleSaveBio = async () => {
    updateUserDataMutation.mutate(
      { bio },
      {
        onSuccess: () => {
          setShowEditBioModal(false);
          toast({
            title: "Success",
            description: "Bio updated successfully",
            variant: "default",
            duration: 4000,
          });
        },
      }
    );
  };

  // const handleAddUpdate = async () => {
  //   if (
  //     duration === "" ||
  //     Number(duration) < 1 ||
  //     Number(duration) > 24 ||
  //     !message.trim()
  //   )
  //     return;
  //   updateUserDataMutation.mutate(
  //     {
  //       notifications: [{ message, duration: Number(duration) }],
  //     },
  //     {
  //       onSuccess: () => {
  //         setShowUpdatePopup(false);
  //         toast({
  //           title: "Success",
  //           description: "Notification updated",
  //           variant: "default",
  //           duration: 4000,
  //         });
  //       },
  //     }
  //   );
  // };
  const handleAddUpdate = async () => {
  if (
    duration === "" ||
    Number(duration) < 1 ||
    Number(duration) > 24 ||
    !message.trim()
  )
    return;

  const now = new Date().toISOString();
  const expiresAt = getExpiresAtFromDuration(Number(duration));

  updateUserDataMutation.mutate(
    {
      // notifications: [
      //   {
      //     message,
      //     duration: Number(duration),
      //     timestamp: now,
      //     expiresAt,
      //   },
      notifications: [
  ...(userData?.notifications?.filter((n) => !isNotificationExpired(n)) || []),
  { message, duration: Number(duration), timestamp: now, expiresAt }
],

    
    },
    {
      onSuccess: () => {
        setShowUpdatePopup(false);
        toast({
          title: "Success",
          description: "Notification added successfully",
          variant: "default",
          duration: 4000,
        });
      },
    }
  );
};

  const handleSelectLink = (index: number) => {
    setSelectedLinkIndex(index);
  };

  const handleReorderLinks = (reorderedLinks: SocializeLink[]) => {
    // Optimistic UI to keep the interface snappy
    setLinks(reorderedLinks);
    updateUserDataMutation.mutate({ links: reorderedLinks });
  };

  useEffect(() => {
    const data = userData || initialData;
    if (data) {
      setLinks(data.links || []);
      setBio(data.bio || "");
      setMessage(data.notifications?.[0]?.message || "");
      setDuration(data.notifications?.[0]?.duration ?? 1);
      setBanner(data.banner || {
        type: 'color',
        value: '#0e6b9c',
        gradientType: 'linear',
        gradientColors: []
      });
    }
  }, [userData, initialData]);

  const handleBannerChange = (newBanner: BannerConfig) => {
    setBanner(newBanner);
    updateUserDataMutation.mutate({ banner: newBanner });
  };
  // console.log("Notifications:", userData?.updates);
//      const activeNotification =
//   userData?.notifications?.find((n) => !isNotificationExpired(n)) ?? null;
// // Force re-check every minute to auto-hide expired notifications
// Auto-filter out expired notifications
const activeNotification =
  (userData?.notifications ?? []).filter((n) => !isNotificationExpired(n))[0] ??
  null;

// Re-render every minute to re-check expiry
const [, forceRender] = useState(0);
useEffect(() => {
  const interval = setInterval(() => forceRender((v) => v + 1), 10_000);
  return () => clearInterval(interval);
}, []);




  return (
    <div className="relative">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="relative z-10 space-y-6"
      >
        <div className="grid lg:grid-cols-3 gap-8">
          {/* Main Content Area */}
          <div className="lg:col-span-2 space-y-6">
            <BannerCustomizer
              banner={banner}
              onBannerChange={handleBannerChange}
              isUploading={updateUserDataMutation.isPending}
            />
            <SocializeHeader
              user={
                user
                  ? {
                    username: user.username ?? undefined,
                    imageUrl: user.imageUrl ?? undefined,
                  }
                  : null
              }
              bio={bio}
              onEditBio={() => setShowEditBioModal(true)}
            />
            <SocializeShareBar
              uniqueUsername={uniqueUsername}
              onShare={(platform) => {
                if (platform === "copy") {
                  toast({
                    title: "Success",
                    description: "URL copied to clipboard",
                    variant: "default",
                    duration: 4000,
                  });
                }
              }}
            />
            <SocializeAddLinkButton onClick={() => setShowAddModal(true)} />
            {/* {userData?.notifications?.[0]?.message ? (
              <SocializeNotificationCard
                message={userData.notifications[0].message}
                duration={userData.notifications[0].duration}
                onEdit={() => setShowUpdatePopup(true)}
              />
            ) : (
              <div className="mb-6">
                <Button
                  variant="outline"
                  className="border-[#0e6b9c]/30 hover:bg-[#0c4362] hover:text-white"
                  onClick={() => setShowUpdatePopup(true)}
                >
                  <Bell className="w-4 h-4 mr-2" />
                  Add a New Update
                </Button>
              </div>
            )} */}
         

{activeNotification ? (
  <SocializeNotificationCard
    message={activeNotification.message}
    duration={activeNotification.duration}
    onEdit={() => setShowUpdatePopup(true)}
  />
) : (
  <div className="mb-6">
    <Button
      variant="outline"
      className="border-[#0e6b9c]/30 hover:bg-[#0c4362] hover:text-white"
      onClick={() => setShowUpdatePopup(true)}
    >
      <Bell className="w-4 h-4 mr-2" />
      Add a New Update
    </Button>
  </div>
)}

            <SocializeLinksCard
              links={links}
              selectedLinkIndex={selectedLinkIndex}
              onSelectLink={handleSelectLink}
              onRemoveLink={handleRemoveLink}
              onEditLink={handleEditLink}
              onReorder={handleReorderLinks}
            />
          </div>

          {/* Sidebar */}
          <div className="lg:col-span-1 sticky top-20">
            <SocializeLinkPreviewCard
              selectedLinkIndex={selectedLinkIndex}
              isPreviewLoading={isPreviewLoading}
              previewData={previewData ?? null}
              userLinks={links || []}
              userBio={userData?.bio || ""}
              userLogo={
                user && "imageUrl" in user ? (user.imageUrl ?? null) : null
              }
              userName={
                user && "username" in user
                  ? (user.username ?? undefined)
                  : undefined
              }
              userBanner={banner}
            />
          </div>
        </div>
      </motion.div>

      {/* Modals */}
      <Dialog open={showAddModal} onOpenChange={setShowAddModal}>
        <DialogContent className="bg-black text-white p-6">
          <DialogHeader className="pb-4">
            <DialogTitle className="flex items-center gap-2 text-xl">
              <Plus className="w-5 h-5 text-[#0e6b9c]" />
              Add New Link
            </DialogTitle>
            <DialogDescription>
              Add a new social media or website link to your profile
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm text-gray-400">URL</label>
              <Input
                type="url"
                placeholder="https://"
                value={newLink.url}
                onChange={(e) => {
                  const url = e.target.value;
                  const platform = detectPlatformFromUrl(url);
                  setNewLink({ ...newLink, url, platform });
                }}
                className="bg-[#121212] border-[#0e6b9c]/30 focus:ring-[#0e6b9c]/30 text-white"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm text-gray-400">Title (optional)</label>
              <Input
                type="text"
                placeholder="Link title (defaults to platform)"
                value={newLink.title || ""}
                onChange={(e) =>
                  setNewLink({ ...newLink, title: e.target.value })
                }
                className="bg-[#121212] border-[#0e6b9c]/30 focus:ring-[#0e6b9c]/30 text-white"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm text-gray-400">Platform</label>
              <Select
                value={newLink.platform}
                onValueChange={(value) =>
                  setNewLink({ ...newLink, platform: value })
                }
              >
                <SelectTrigger className="bg-[#121212] border-[#0e6b9c]/30 focus:ring-[#0e6b9c]/30">
                  <SelectValue placeholder="Select platform" />
                </SelectTrigger>
                <SelectContent className="bg-[#121212] border-[#0e6b9c]/30">
                  <SelectItem value="youtube">YouTube</SelectItem>
                  <SelectItem value="instagram">Instagram</SelectItem>
                  <SelectItem value="tiktok">TikTok</SelectItem>
                  <SelectItem value="twitter">
                    X (formerly known as Twitter)
                  </SelectItem>
                  <SelectItem value="linkedin">LinkedIn</SelectItem>
                  <SelectItem value="facebook">Facebook</SelectItem>
                  <SelectItem value="snapchat">Snapchat</SelectItem>
                  <SelectItem value="reddit">Reddit</SelectItem>
                  <SelectItem value="discord">Discord</SelectItem>
                  <SelectItem value="github">Github</SelectItem>
                  <SelectItem value="website">Website</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter className="pt-4">
            <Button variant="outline" onClick={() => setShowAddModal(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleAddLink}
              disabled={!newLink.url.trim()}
              className={`${newLink.url.trim()
                ? "bg-gradient-to-r from-[#0e6b9c] to-[#0e6b9c]/70 text-white"
                : "bg-gray-800 text-gray-400 cursor-not-allowed"
                }`}
            >
              Add Link
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showEditBioModal} onOpenChange={setShowEditBioModal}>
        <DialogContent className="bg-black text-white p-6">
          <DialogHeader className="pb-4">
            <DialogTitle className="text-xl">Edit Bio</DialogTitle>
            <DialogDescription>Update your profile bio</DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm text-gray-400">Bio</label>
              <Textarea
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                placeholder="Tell people about yourself..."
                className="bg-[#121212] border-[#0e6b9c]/30 focus:ring-[#0e6b9c]/30 text-white resize-none"
                rows={3}
                maxLength={80}
              />
              <div className="flex justify-end text-xs text-gray-400">
                {bio.length} / 80
              </div>
            </div>
          </div>

          <DialogFooter className="pt-4">
            <Button
              variant="outline"
              onClick={() => setShowEditBioModal(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSaveBio}
              className="bg-gradient-to-r from-[#0e6b9c] to-[#0e6b9c]/70 text-white"
            >
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showUpdatePopup} onOpenChange={setShowUpdatePopup}>
        <DialogContent className="bg-black text-white p-6">
          <DialogHeader className="pb-4">
            <DialogTitle className="flex items-center gap-2 text-xl">
              <Bell className="w-5 h-5 text-[#0e6b9c]" />
              Update Notification
            </DialogTitle>
            <DialogDescription>
              Add a notification that will be shown to your profile visitors
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm text-gray-400">Duration (hours)</label>
              <Input
                type="number"
                min={1}
                max={24}
                value={duration === "" ? "" : duration}
                onChange={(e) => {
                  const val = e.target.value;
                  if (val === "") {
                    setDuration("");
                  } else {
                    const num = Math.max(1, Math.min(24, +val));
                    setDuration(num);
                  }
                }}
                onBlur={() => {
                  if (duration === "" || isNaN(Number(duration)))
                    setDuration(1);
                }}
                className="bg-[#121212] border-[#0e6b9c]/30 focus:ring-[#0e6b9c]/30 text-white"
              />
              <p className="text-xs text-gray-400">Between 1 and 24 hours</p>
            </div>

            <div className="space-y-2">
              <label className="text-sm text-gray-400">Message</label>
              <Textarea
                value={message}
                onChange={(e) => setMessage(e.target.value.slice(0, 150))}
                placeholder="Enter your notification message..."
                className="bg-[#121212] border-[#0e6b9c]/30 focus:ring-[#0e6b9c]/30 text-white resize-none"
                rows={3}
                maxLength={150}
              />
              <div className="flex justify-end text-xs text-gray-400">
                {message.length} / 150
              </div>
            </div>
          </div>

          <DialogFooter className="pt-4">
            <Button variant="outline" onClick={() => setShowUpdatePopup(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleAddUpdate}
              disabled={
                !message ||
                duration === "" ||
                Number(duration) < 1 ||
                Number(duration) > 24
              }
              className={`${message &&
                duration !== "" &&
                Number(duration) >= 1 &&
                Number(duration) <= 24
                ? "bg-gradient-to-r from-[#0e6b9c] to-[#0e6b9c]/70 text-white"
                : "bg-gray-800 text-gray-400 cursor-not-allowed"
                }`}
            >
              Save Notification
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Link Modal */}
      <Dialog open={showEditLinkModal} onOpenChange={setShowEditLinkModal}>
        <DialogContent className="bg-black text-white p-6">
          <DialogHeader className="pb-4">
            <DialogTitle className="flex items-center gap-2 text-xl">
              <Plus className="w-5 h-5 text-[#0e6b9c]" />
              Edit Link
            </DialogTitle>
            <DialogDescription>
              Edit the social media or website link on your profile
            </DialogDescription>
          </DialogHeader>

          {editingLink && (
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <label className="text-sm text-gray-400">URL</label>
                <Input
                  type="url"
                  placeholder="https://"
                  value={editingLink.url}
                  onChange={(e) => {
                    const url = e.target.value;
                    const platform = detectPlatformFromUrl(url);
                    setEditingLink({ ...editingLink, url, platform });
                  }}
                  className="bg-[#121212] border-[#0e6b9c]/30 focus:ring-[#0e6b9c]/30 text-white"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm text-gray-400">
                  Title (optional)
                </label>
                <Input
                  type="text"
                  placeholder="Link title (defaults to platform)"
                  value={editingLink.title || ""}
                  onChange={(e) =>
                    setEditingLink({ ...editingLink, title: e.target.value })
                  }
                  className="bg-[#121212] border-[#0e6b9c]/30 focus:ring-[#0e6b9c]/30 text-white"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm text-gray-400">Platform</label>
                <Select
                  value={editingLink.platform}
                  onValueChange={(value) =>
                    setEditingLink({ ...editingLink, platform: value })
                  }
                >
                  <SelectTrigger className="bg-[#121212] border-[#0e6b9c]/30 focus:ring-[#0e6b9c]/30">
                    <SelectValue placeholder="Select platform" />
                  </SelectTrigger>
                  <SelectContent className="bg-[#121212] border-[#0e6b9c]/30">
                    <SelectItem value="youtube">YouTube</SelectItem>
                    <SelectItem value="instagram">Instagram</SelectItem>
                    <SelectItem value="tiktok">TikTok</SelectItem>
                    <SelectItem value="twitter">
                      X (formerly known as Twitter)
                    </SelectItem>
                    <SelectItem value="linkedin">LinkedIn</SelectItem>
                    <SelectItem value="facebook">Facebook</SelectItem>
                    <SelectItem value="snapchat">Snapchat</SelectItem>
                    <SelectItem value="reddit">Reddit</SelectItem>
                    <SelectItem value="discord">Discord</SelectItem>
                    <SelectItem value="github">Github</SelectItem>
                    <SelectItem value="website">Website</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          <DialogFooter className="pt-4">
            <Button
              variant="outline"
              onClick={() => setShowEditLinkModal(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={handleUpdateLink}
              disabled={!editingLink?.url.trim()}
              className={`${editingLink?.url.trim()
                ? "bg-gradient-to-r from-[#0e6b9c] to-[#0e6b9c]/70 text-white"
                : "bg-gray-800 text-gray-400 cursor-not-allowed"
                }`}
            >
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}