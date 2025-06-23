"use client";

import { useEffect, useState } from "react";
import { useUser } from "@clerk/nextjs";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import { toast } from "sonner";
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

interface ILink {
  platform: string;
  url: string;
}

interface ISocialize {
  clerkUserId: string;
  username: string;
  profileImage: string;
  bio: string;
  links: ILink[];
  uniqueUsername?: string;
  notifications?: { message: string; duration: number }[];
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
  const [showUpdatePopup, setShowUpdatePopup] = useState(false);
  const [newLink, setNewLink] = useState<ILink>({
    platform: "youtube",
    url: "",
  });
  const [duration, setDuration] = useState(1);
  const [message, setMessage] = useState("");
  const [selectedLinkIndex, setSelectedLinkIndex] = useState<number | null>(
    null
  );
  const [bio, setBio] = useState("");
  const [showEditBioModal, setShowEditBioModal] = useState(false);

  // Queries and mutations remain unchanged...
  const { data: userData } = useQuery({
    queryKey: ["userData", uniqueUsername],
    queryFn: async () => {
      if (!uniqueUsername) return null;

      const { data } = await api.get<ISocialize>(
        `/services/socialize?uniqueUsername=${uniqueUsername}`
      );
      return data;
    },
    initialData: initialData,
    enabled: !!uniqueUsername,
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
      const { data } = await api.get(
        `/link-preview?url=${encodeURIComponent(url)}`
      );
      return data as LinkPreview;
    },
    enabled:
      selectedLinkIndex !== null && !!userData?.links?.[selectedLinkIndex],
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
      toast.error("Failed to update profile");
      console.error("Update error:", error);
    },
  });

  // Event handlers remain unchanged...
  const handleAddLink = async () => {
    if (!newLink.url.trim()) return;
    const updatedLinks = [...(userData?.links || []), newLink];
    updateUserDataMutation.mutate(
      { links: updatedLinks },
      {
        onSuccess: () => {
          setShowAddModal(false);
          setNewLink({ platform: "youtube", url: "" });
          toast.success("Link added successfully");
        },
      }
    );
  };

  const handleRemoveLink = async (indexToRemove: number) => {
    if (!userData?.links) return;
    const updatedLinks = userData.links.filter(
      (_, index) => index !== indexToRemove
    );
    updateUserDataMutation.mutate(
      { links: updatedLinks },
      {
        onSuccess: () => {
          if (selectedLinkIndex === indexToRemove) {
            setSelectedLinkIndex(null);
          }
          toast.success("Link removed");
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
          toast.success("Bio updated successfully");
        },
      }
    );
  };

  const handleAddUpdate = async () => {
    if (duration < 1 || duration > 24 || !message.trim()) return;
    updateUserDataMutation.mutate(
      {
        notifications: [{ message, duration }],
      },
      {
        onSuccess: () => {
          setShowUpdatePopup(false);
          toast.success("Notification updated");
        },
      }
    );
  };
  const handleSelectLink = (index: number) => {
    setSelectedLinkIndex(index);
  };

  useEffect(() => {
    if (userData) {
      setBio(userData.bio || "");
      setMessage(userData.notifications?.[0]?.message || "");
      setDuration(userData.notifications?.[0]?.duration || 1);
    }
  }, [userData]);

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
                  toast.success("URL copied to clipboard");
                }
              }}
            />
            <SocializeAddLinkButton onClick={() => setShowAddModal(true)} />
            {userData?.notifications?.[0]?.message ? (
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
            )}
            <SocializeLinksCard
              links={userData?.links || []}
              selectedLinkIndex={selectedLinkIndex}
              onSelectLink={handleSelectLink}
              onRemoveLink={handleRemoveLink}
            />
          </div>

          {/* Sidebar */}
          <div className="lg:col-span-1 sticky top-20">
            <SocializeLinkPreviewCard
              selectedLinkIndex={selectedLinkIndex}
              isPreviewLoading={isPreviewLoading}
              previewData={previewData ?? null}
              userLinks={userData?.links || []}
              userBio={userData?.bio || ""}
              userLogo={
                user && "imageUrl" in user ? (user.imageUrl ?? null) : null
              }
              userName={
                user && "username" in user
                  ? (user.username ?? undefined)
                  : undefined
              }
            />
          </div>
        </div>
      </motion.div>

      {/* Modals */}
      <Dialog open={showAddModal} onOpenChange={setShowAddModal}>
        <DialogContent className="bg-black border-[#0e6b9c]/50 text-white">
          <DialogHeader>
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
                  <SelectItem value="github">Github</SelectItem>
                  <SelectItem value="website">Website</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-sm text-gray-400">URL</label>
              <Input
                type="url"
                placeholder="https://"
                value={newLink.url}
                onChange={(e) =>
                  setNewLink({ ...newLink, url: e.target.value })
                }
                className="bg-[#121212] border-[#0e6b9c]/30 focus:ring-[#0e6b9c]/30 text-white"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddModal(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleAddLink}
              disabled={!newLink.url.trim()}
              className={`${
                newLink.url.trim()
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
        <DialogContent className="bg-black border-[#0e6b9c]/50 text-white">
          <DialogHeader>
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

          <DialogFooter>
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
        <DialogContent className="bg-black border-[#0e6b9c]/50 text-white">
          <DialogHeader>
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
                value={duration}
                onChange={(e) =>
                  setDuration(Math.max(1, Math.min(24, +e.target.value)))
                }
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

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowUpdatePopup(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleAddUpdate}
              disabled={!message || duration < 1 || duration > 24}
              className={`${
                message && duration >= 1 && duration <= 24
                  ? "bg-gradient-to-r from-[#0e6b9c] to-[#0e6b9c]/70 text-white"
                  : "bg-gray-800 text-gray-400 cursor-not-allowed"
              }`}
            >
              Save Notification
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
