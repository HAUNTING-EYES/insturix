"use client";

import { useEffect, useState } from "react";
import { useUser } from "@clerk/nextjs";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import { toast } from "sonner";
import { motion } from "framer-motion";
import Link from "next/link";
import {
  ExternalLink,
  Plus,
  Trash2,
  Bell,
  Copy,
  Check,
  Share2,
} from "lucide-react";

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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { getPlatformIcon } from "./SocializeIcons";
import { MobileView } from "./MobileView";
import Image from "next/image";

// Types
interface Link {
  platform: string;
  url: string;
}

interface UserData {
  links?: Link[];
  bio?: string;
  notifications?: { message: string; duration: number }[];
}

interface LinkPreview {
  title: string;
  description: string;
  image: string | null;
  url: string;
}

// API client
const api = axios.create({
  baseURL: "/api",
  headers: {
    "Content-Type": "application/json",
  },
});

export default function DashboardForSocialize() {
  const { user } = useUser();
  const queryClient = useQueryClient();
  const uniqueUsername = user?.username || "";

  // State
  const [showAddModal, setShowAddModal] = useState(false);
  const [showUpdatePopup, setShowUpdatePopup] = useState(false);
  const [newLink, setNewLink] = useState({ platform: "youtube", url: "" });
  const [duration, setDuration] = useState(1);
  const [message, setMessage] = useState("");
  const [copied, setCopied] = useState(false);
  const [selectedLinkIndex, setSelectedLinkIndex] = useState<number | null>(
    null
  );
  const [bio, setBio] = useState("");
  const [showEditBioModal, setShowEditBioModal] = useState(false);

  // Queries
  const { data: userData, isLoading } = useQuery({
    queryKey: ["userData", uniqueUsername],
    queryFn: async () => {
      if (!uniqueUsername) return { links: [], bio: "", notifications: [] };
      const { data } = await api.get(
        `/services/socialize?uniqueUsername=${uniqueUsername}`
      );
      return data;
    },
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

  // Mutations
  const updateUserDataMutation = useMutation({
    mutationFn: async (data: Partial<UserData>) => {
      return api.post("/services/socialize", { uniqueUsername, ...data });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["userData", uniqueUsername] });
    },
    onError: (error) => {
      toast.error("Failed to update profile");
      console.error("Update error:", error);
    },
  });

  // Effects
  useEffect(() => {
    if (userData) {
      setBio(userData.bio || "");
      setMessage(userData.notifications?.[0]?.message || "");
      setDuration(userData.notifications?.[0]?.duration || 1);
    }
  }, [userData]);

  // Handlers
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
    const updatedLinks: Link[] = (userData?.links || []).filter(
      (index: number) => index !== indexToRemove
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

  const handleCopyUrl = () => {
    const url = `https://insturix.com/socialize/${uniqueUsername}`;
    navigator.clipboard
      .writeText(url)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
        toast.success("URL copied to clipboard");
      })
      .catch(() => {
        toast.error("Failed to copy URL");
      });
  };

  const handleSelectLink = (index: number) => {
    setSelectedLinkIndex(index);
  };

  return (
    <div className="min-h-screen bg-black flex flex-col">
      {/* Header */}
      <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-4xl font-semibold tracking-tight text-zinc-100 flex items-center gap-3">
          <Share2 className="h-8 w-8 text-teal-500" />
          Socialize
        </h1>
        <p className="mt-3 text-lg text-zinc-400 font-light">Transform your ideas into unique musical compositions</p>
      </div>
      <div className="flex flex-col flex-1 justify-start items-center p-4 md:p-8 lg:p-10">
        <div
          className="fixed inset-0 -left-1/8 -top-20 z-[0] pointer-events-none
          bg-[radial-gradient(ellipse_at_top,_#0e6b9c_2%,_#0e6b9c_2%,_transparent_60%)]
          w-full h-[100vh] transition-all duration-700"
        />

        {/* Main Content */}
        {isLoading ? (
          <div className="flex-1 flex items-center justify-center w-full max-w-6xl">
            <div className="w-16 h-16 border-t-4 border-b-4 border-[#0e6b9c] rounded-full animate-spin"></div>
          </div>
        ) : (
          <div className="w-full max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-8 relative z-10">
            <div className="lg:col-span-2">
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5 }}
                className="bg-black/20 p-4 rounded-lg mb-8 backdrop-blur-sm border border-[#0e6b9c]/30"
              >
                <div className="flex items-center justify-between gap-4 flex-wrap md:flex-nowrap">
                  <div className="flex items-center gap-2">
                    <span className="text-orange-400">🔥</span>
                    <span className="text-white">Your link is live:</span>
                    <Link
                      href={`https://insturix.com/socialize/${uniqueUsername}`}
                      className="text-blue-400 hover:underline truncate max-w-[200px] md:max-w-none"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      insturix.com/socialize/{uniqueUsername}
                    </Link>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="bg-white text-black hover:bg-gray-200 hover:text-black"
                    onClick={handleCopyUrl}
                  >
                    {copied ? (
                      <Check className="w-4 h-4 mr-2" />
                    ) : (
                      <Copy className="w-4 h-4 mr-2" />
                    )}
                    {copied ? "Copied!" : "Copy URL"}
                  </Button>
                </div>
              </motion.div>

              {/* Profile Section */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.1 }}
                className="mb-8"
              >
                <Card className="bg-black/30 border-[#0e6b9c]/20 backdrop-blur-sm">
                  <CardHeader>
                    <div className="flex items-center gap-4">
                      <div className="w-16 h-16 rounded-full overflow-hidden border-2 border-[#0e6b9c]">
                        <Image
                          src={user?.imageUrl as string}
                          width={32}
                          height={64}
                          alt={`${user?.username}'s profile picture`}
                          className="w-full h-full object-cover"
                        />
                      </div>
                      <div>
                        <CardTitle className="text-xl text-white">
                          {user?.username}
                        </CardTitle>
                        <CardDescription className="text-gray-300">
                          {userData?.bio ||
                            "No bio yet. Click edit to add one."}
                        </CardDescription>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        className="ml-auto"
                        onClick={() => setShowEditBioModal(true)}
                      >
                        Edit Bio
                      </Button>
                    </div>
                  </CardHeader>
                </Card>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.2 }}
                className="mb-6"
              >
                <Button
                  className="w-full bg-gradient-to-r from-[#0e6b9c]/80 to-[#0e6b9c]/40 hover:from-[#0e6b9c] hover:to-[#0e6b9c]/60 text-white border border-[#0e6b9c]/50 shadow-lg shadow-[#0e6b9c]/20"
                  onClick={() => setShowAddModal(true)}
                >
                  <Plus className="w-5 h-5 mr-2" />
                  Add New Link
                </Button>
              </motion.div>

              {userData?.notifications?.[0]?.message ? (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5, delay: 0.3 }}
                  className="mb-6"
                >
                  <Card className="bg-black/40 border-[#0e6b9c]/30">
                    <CardContent className="p-4 flex items-center gap-3">
                      <div className="w-8 h-8 bg-[#0e6b9c]/30 rounded-full flex items-center justify-center">
                        <Bell className="w-4 h-4 text-white" />
                      </div>
                      <div className="flex-1">
                        <p className="text-white font-medium">
                          {userData.notifications[0].message}
                        </p>
                        <p className="text-gray-400 text-sm">
                          Duration: {userData.notifications[0].duration} hours
                        </p>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setShowUpdatePopup(true)}
                      >
                        Edit
                      </Button>
                    </CardContent>
                  </Card>
                </motion.div>
              ) : (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5, delay: 0.3 }}
                  className="mb-6"
                >
                  <Button
                    variant="outline"
                    className="border-[#0e6b9c]/30 hover:bg-[#0c4362] hover:text-white"
                    onClick={() => setShowUpdatePopup(true)}
                  >
                    <Bell className="w-4 h-4 mr-2" />
                    Add a New Update
                  </Button>
                </motion.div>
              )}

              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.4 }}
              >
                <Card className="bg-black/30 border-[#0e6b9c]/20 backdrop-blur-sm">
                  <CardHeader>
                    <CardTitle className="text-xl text-white">
                      Your Links
                    </CardTitle>
                    <CardDescription>
                      {userData?.links?.length
                        ? `You have ${userData.links.length} link${userData.links.length > 1 ? "s" : ""}`
                        : "Add your first link to get started"}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {userData?.links?.length ? (
                      <div className="grid gap-4">
                        {userData.links.map((link: Link, index: number) => (
                          <motion.div
                            key={index}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.3, delay: index * 0.1 }}
                            className={`w-full bg-black/40 py-3 rounded-lg flex items-center justify-between gap-2 hover:bg-black/60 transition border ${selectedLinkIndex === index ? "border-[#0e6b9c]" : "border-[#0e6b9c]/30"} px-5 cursor-pointer`}
                            onClick={() => handleSelectLink(index)}
                          >
                            <div className="flex items-center gap-4 flex-1 truncate">
                              {getPlatformIcon(link.platform)}
                              <span className="text-white truncate">
                                {link.url}
                              </span>
                            </div>
                            <div className="flex items-center gap-2">
                              <Button
                                variant="ghost"
                                size="icon"
                                asChild
                                onClick={(
                                  e: React.MouseEvent<HTMLButtonElement>
                                ) => e.stopPropagation()}
                              >
                                <Link
                                  href={link.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-gray-400 hover:text-white"
                                >
                                  <ExternalLink className="w-4 h-4" />
                                </Link>
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="text-gray-400 hover:text-white"
                                onClick={(
                                  e: React.MouseEvent<HTMLButtonElement>
                                ) => {
                                  e.stopPropagation();
                                  handleRemoveLink(index);
                                }}
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </div>
                          </motion.div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-center py-8">
                        <div className="w-12 h-12 bg-[#0e6b9c]/20 rounded-full flex items-center justify-center mx-auto mb-4">
                          <span className="text-2xl">✨</span>
                        </div>
                        <p className="mb-2 text-lg font-medium text-white">
                          Show the world who you are.
                        </p>
                        <p className="text-gray-400">
                          Add a link to get started.
                        </p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </motion.div>
            </div>

            {/* Link Preview Section */}
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.5, delay: 0.5 }}
              className="lg:col-span-1 sticky top-20"
            >
              <Card className="bg-black/30 border-[#0e6b9c]/30 backdrop-blur-sm h-full">
                <CardHeader>
                  <CardTitle className="text-lg text-white">
                    Link Preview
                  </CardTitle>
                  <CardDescription>
                    Select a link to see how it appears to visitors
                  </CardDescription>
                </CardHeader>

                <CardContent>
                  {selectedLinkIndex !== null ? (
                    isPreviewLoading ? (
                      <div className="space-y-3">
                        <Skeleton className="h-[200px] w-full bg-gray-800" />
                        <Skeleton className="h-4 w-3/4 bg-gray-800" />
                        <Skeleton className="h-4 w-full bg-gray-800" />
                        <Skeleton className="h-4 w-1/2 bg-gray-800" />
                      </div>
                    ) : (
                      <div className="rounded-lg overflow-hidden border border-[#0e6b9c]/30">
                        <div className="aspect-video bg-gray-800 relative overflow-hidden">
                          {previewData?.image ? (
                            <Image
                              src={previewData.image as string}
                              alt={previewData.title as string}
                              width={64}
                              height={64}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center bg-gray-900">
                              <Share2 className="w-10 h-10 text-gray-700" />
                            </div>
                          )}
                        </div>
                        <div className="p-4 bg-black/60">
                          <h3 className="font-medium text-white mb-2 line-clamp-2">
                            {previewData?.title || "No title available"}
                          </h3>
                          <p className="text-gray-300 text-sm line-clamp-3">
                            {previewData?.description ||
                              "No description available"}
                          </p>
                          <div className="mt-4 flex items-center justify-between">
                            <Badge
                              variant="outline"
                              className="text-xs text-gray-400 truncate max-w-[180px]"
                            >
                              {userData?.links?.[selectedLinkIndex]?.platform}
                            </Badge>
                            <Button
                              variant="link"
                              size="sm"
                              className="text-[#0e6b9c] hover:text-[#0e6b9c]/80 p-0"
                              asChild
                            >
                              <a
                                href={userData?.links?.[selectedLinkIndex]?.url}
                                target="_blank"
                                rel="noopener noreferrer"
                              >
                                Visit
                                <ExternalLink className="w-3 h-3 ml-1" />
                              </a>
                            </Button>
                          </div>
                        </div>
                      </div>
                    )
                  ) : (
                    <div className="flex flex-col items-center justify-center p-8 text-center">
                      <div className="w-16 h-16 bg-[#0e6b9c]/20 rounded-full flex items-center justify-center mb-4">
                        <ExternalLink className="w-8 h-8 text-[#0e6b9c]" />
                      </div>
                      <h3 className="text-white font-medium mb-2">
                        No link selected
                      </h3>
                      <p className="text-gray-400 text-sm">
                        Click on a link from your list to see a preview of how
                        it will appear to your visitors
                      </p>
                    </div>
                  )}
                </CardContent>

                <CardFooter className="border-t border-[#0e6b9c]/30 pt-4">
                  <MobileView
                    logo={user?.imageUrl || null}
                    profileTitle={user?.username || ""}
                    bio={userData?.bio || ""}
                    links={userData?.links || []}
                  />
                </CardFooter>
              </Card>
            </motion.div>
          </div>
        )}

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
                    <SelectItem value="twitter">Twitter</SelectItem>
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
                <label className="text-sm text-gray-400">
                  Duration (hours)
                </label>
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
              <Button
                variant="outline"
                onClick={() => setShowUpdatePopup(false)}
              >
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
    </div>
    </div>
  );
}
