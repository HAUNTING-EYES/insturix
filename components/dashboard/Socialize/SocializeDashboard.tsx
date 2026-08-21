"use client";

import { useEffect, useState, useRef } from "react";
import { useUser } from "@clerk/nextjs";
import { useGSAP } from "@gsap/react";
import { gsap } from "@/lib/animation/gsap-config";
import { DURATIONS, STAGGER } from "@/lib/animation/presets";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
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
import { StoryArc } from "./StoryArc";
import TimelineSpine, { NodeDot, TimelineEnd } from "./TimelineSpine";
import SyncDots from "./SyncDots";
import { NarrativeLabel } from "./NarrativeLabel";
import { SocializePreview } from "./PreviewSocialize";
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
  status?: string;
  accentColor?: string;
}

/** Honest relative timestamp for "Updated …" — the label was previously a
    hardcoded "2m ago" regardless of reality. */
function relativeTime(value: Date | string): string {
  const then = new Date(value).getTime();
  if (!Number.isFinite(then)) return "recently";
  const s = Math.max(0, Math.floor((Date.now() - then) / 1000));
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return d < 30 ? `${d}d ago` : new Date(then).toLocaleDateString();
}

const api = axios.create({
  baseURL: "/api",
  headers: {
    "Content-Type": "application/json",
  },
  // Prevent long hangs on slow endpoints and avoid blocking initial paint
  timeout: 4000,
});

// Response interceptor to ensure consistent response format
api.interceptors.response.use(
  (response) => response,
  (error) => {
    console.error("API Error:", error);
    return Promise.reject(error);
  }
);

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
  const [editingLink, setEditingLink] = useState<SocializeLink | null>(null);
  const [editingLinkIndex, setEditingLinkIndex] = useState<number | null>(null);
  const [editingNotificationIndex, setEditingNotificationIndex] = useState<number | null>(null);
  const [showEditLinkModal, setShowEditLinkModal] = useState(false);
  const [bio, setBio] = useState("");
  const [showEditBioModal, setShowEditBioModal] = useState(false);
  const [links, setLinks] = useState<SocializeLink[]>(initialData?.links || []);
  const [banner, setBanner] = useState<BannerConfig>(
    initialData?.banner || {
      type: 'color',
      value: '#D4A652',
      gradientType: 'linear',
      gradientColors: []
    }
  );
  const [status, setStatus] = useState(initialData?.status || "");
  const [accentColor, setAccentColor] = useState(initialData?.accentColor || "gold");
  const [activeSection, setActiveSection] = useState<string | null>(null);
  const sectionRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const socPageRef = useRef<HTMLDivElement>(null);

  // GSAP entrance — staggered fadeUp for main sections
  useGSAP(() => {
    gsap.fromTo('[data-soc-animate]',
      { y: 24, opacity: 0 },
      { y: 0, opacity: 1, duration: DURATIONS.atmosphere, ease: 'expo.out', stagger: { each: STAGGER.wide.each, from: 'start' } }
    );
  }, { scope: socPageRef });

  const scrollToSection = (id: string) => {
    sectionRefs.current[id]?.scrollIntoView({ behavior: "smooth", block: "start" });
    setActiveSection(id);
  };

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

  const updateUserDataMutation = useMutation({
    mutationFn: async (data: Partial<ISocialize>) => {
      return api.patch("/services/socialize", {
        username: uniqueUsername,
        ...data,
      });
    },
    onSuccess: (response) => {
      queryClient.setQueryData(['userData', uniqueUsername], response.data.profile);
      // Force re-render to update UI immediately
      setMessage("");
      setDuration(1);
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

  const deleteNotificationMutation = useMutation({
    mutationFn: async ({ notificationIndex }: { notificationIndex: number }) => {
      return api.delete("/services/socialize", {
        data: {
          username: uniqueUsername,
          notificationIndex,
        },
      });
    },
    onSuccess: (response) => {
      queryClient.setQueryData(['userData', uniqueUsername], response.data.profile);
      // Update the local state to reflect the changes immediately
      setLinks(response.data.profile.links || []);
      setBio(response.data.profile.bio || "");
      setBanner(response.data.profile.banner || {
        type: 'color',
        value: '#D4A652',
        gradientType: 'linear',
        gradientColors: []
      });
      toast({
        title: "Success",
        description: "Notification deleted successfully",
        variant: "default",
        duration: 4000,
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Failed to delete notification",
        variant: "destructive",
        duration: 4000,
      });
      console.error("Delete notification error:", error);
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
        onSuccess: (response) => {
          setShowAddModal(false);
          setNewLink({ platform: "youtube", url: "", title: "" });
          // Update the local state to reflect the changes immediately
          setLinks(response.data.profile.links || []);
          setBio(response.data.profile.bio || "");
          setBanner(response.data.profile.banner || {
            type: 'color',
            value: '#D4A652',
            gradientType: 'linear',
            gradientColors: []
          });
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
        onSuccess: (response) => {
          // Update the local state to reflect the changes immediately
          setLinks(response.data.profile.links || []);
          setBio(response.data.profile.bio || "");
          setBanner(response.data.profile.banner || {
            type: 'color',
            value: '#D4A652',
            gradientType: 'linear',
            gradientColors: []
          });
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
        onSuccess: (response) => {
          setShowEditLinkModal(false);
          setEditingLink(null);
          setEditingLinkIndex(null);
          // Update the local state to reflect the changes immediately
          setLinks(response.data.profile.links || []);
          setBio(response.data.profile.bio || "");
          setBanner(response.data.profile.banner || {
            type: 'color',
            value: '#D4A652',
            gradientType: 'linear',
            gradientColors: []
          });
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
        onSuccess: (response) => {
          setShowEditBioModal(false);
          // Update the local state to reflect the changes immediately
          setBio(response.data.profile.bio || "");
          setLinks(response.data.profile.links || []);
          setBanner(response.data.profile.banner || {
            type: 'color',
            value: '#D4A652',
            gradientType: 'linear',
            gradientColors: []
          });
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

    let updatedNotifications;
    const existingNotifications = userData?.notifications?.filter(n => !isNotificationExpired(n)) || [];

    if (editingNotificationIndex !== null) {
      // Editing an existing notification
      updatedNotifications = [...existingNotifications];
      updatedNotifications[editingNotificationIndex] = {
        ...updatedNotifications[editingNotificationIndex],
        message,
        duration: Number(duration),
        timestamp: now,
        expiresAt,
      };
    } else {
      // Adding a new notification
      updatedNotifications = [
        ...existingNotifications,
        { message, duration: Number(duration), timestamp: now, expiresAt },
      ];
    }

    updateUserDataMutation.mutate(
      {
        notifications: updatedNotifications,
      },
      {
        onSuccess: (response) => {
          setShowUpdatePopup(false);
          setMessage(""); // Reset message after successful update
          setDuration(1); // Reset duration after successful update
          setEditingNotificationIndex(null); // Reset editing index
          // Update the local state to reflect the changes immediately
          setLinks(response.data.profile.links || []);
          setBio(response.data.profile.bio || "");
          setBanner(response.data.profile.banner || {
            type: 'color',
            value: '#D4A652',
            gradientType: 'linear',
            gradientColors: []
          });
          toast({
            title: "Success",
            description: `Notification ${editingNotificationIndex !== null ? 'updated' : 'added'} successfully`,
            variant: "default",
            duration: 4000,
          });
        },
      }
    );
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
        value: '#D4A652',
        gradientType: 'linear',
        gradientColors: []
      });
    }
  }, [userData, initialData]);

  const handleBannerChange = (newBanner: BannerConfig) => {
    setBanner(newBanner);
    updateUserDataMutation.mutate({ banner: newBanner }, {
      onSuccess: (response) => {
        // Update the local state to reflect the changes immediately
        setBanner(response.data.profile.banner || {
          type: 'color',
          value: '#D4A652',
          gradientType: 'linear',
          gradientColors: []
        });
        setLinks(response.data.profile.links || []);
        setBio(response.data.profile.bio || "");
      }
    });
  };
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




  const timelineSections = [
    { id: "opening", hasData: banner.type !== "color" || banner.value !== "#D4A652", isLive: false },
    { id: "introduction", hasData: (userData?.bio || "").length > 0, isLive: false },
    { id: "chapters", hasData: (links || []).length > 0, isLive: false },
    { id: "breaking", hasData: (userData?.notifications || []).filter(n => !isNotificationExpired(n)).length > 0, isLive: (userData?.notifications || []).filter(n => !isNotificationExpired(n)).length > 0 },
    { id: "signature", hasData: true, isLive: false },
  ];

  return (
    <div ref={socPageRef} className="relative">
      <div data-soc-animate style={{ opacity: 0 }}>
      <StoryArc
        username={uniqueUsername || "your"}
        activeSection={activeSection}
        onWaypointClick={scrollToSection}
        profileUrl={uniqueUsername ? `https://insturix.com/profile/${uniqueUsername}` : undefined}
      />
      </div>

      <div data-soc-animate className="grid xl:grid-cols-2 gap-0 font-jakarta" style={{ minHeight: "calc(100vh - 120px)", opacity: 0 }}>
        {/* Left: Timeline Editor */}
        <div style={{ padding: "24px 28px 60px 0" }}>
          <TimelineSpine sections={timelineSections} activeSection={activeSection}>
            {/* OPENING SCENE */}
            <div
              ref={(el) => { sectionRefs.current["opening"] = el; }}
              className="relative"
              style={{ marginBottom: 28 }}
              onMouseEnter={() => setActiveSection("opening")}
              onMouseLeave={() => setActiveSection(null)}
            >
              <NodeDot hasData={timelineSections[0].hasData} isLive={false} />
              <NarrativeLabel title="OPENING SCENE" timing="~1s" isActive={activeSection === "opening"} id="opening" />
              <BannerCustomizer
                banner={banner}
                onBannerChange={handleBannerChange}
                isUploading={updateUserDataMutation.isPending}
              />
            </div>

            {/* THE INTRODUCTION */}
            <div
              ref={(el) => { sectionRefs.current["introduction"] = el; }}
              className="relative"
              style={{ marginBottom: 28 }}
              onMouseEnter={() => setActiveSection("introduction")}
              onMouseLeave={() => setActiveSection(null)}
            >
              <NodeDot hasData={timelineSections[1].hasData} isLive={false} />
              <NarrativeLabel title="THE INTRODUCTION" timing="~3s" isActive={activeSection === "introduction"} id="introduction" />
              <SocializeHeader
                user={user ? { username: user.username ?? undefined, imageUrl: user.imageUrl ?? undefined } : null}
                bio={bio}
                onEditBio={() => setShowEditBioModal(true)}
                status={status}
                accentColor={accentColor}
              />
              <div style={{ marginTop: 12 }}>
                <label
                  style={{
                    fontFamily: "var(--font-jetbrains-mono)",
                    fontSize: "0.68rem",
                    color: "#5F5E5A",
                    letterSpacing: "0.06em",
                    textTransform: "uppercase" as const,
                    display: "block",
                    marginBottom: 6,
                  }}
                >
                  Status
                </label>
                <input
                  type="text"
                  value={status}
                  maxLength={50}
                  placeholder="What are you working on?"
                  onChange={(e) => {
                    const val = e.target.value;
                    setStatus(val);
                  }}
                  onBlur={() => {
                    updateUserDataMutation.mutate({ status });
                  }}
                  style={{
                    width: "100%",
                    padding: "8px 12px",
                    borderRadius: 7,
                    border: "1px solid #1C1B19",
                    background: "#1B1A18",
                    color: "#ECE9E1",
                    fontSize: "0.82rem",
                    fontFamily: "var(--font-plus-jakarta-sans), system-ui, sans-serif",
                    outline: "none",
                    transition: "border-color 0.25s cubic-bezier(.16,1,.3,1)",
                  }}
                  onFocus={(e) => { e.currentTarget.style.borderColor = "#D4A652"; }}
                  onMouseLeave={(e) => { if (document.activeElement !== e.currentTarget) e.currentTarget.style.borderColor = "#1C1B19"; }}
                />
                <div style={{ textAlign: "right", fontFamily: "var(--font-jetbrains-mono)", fontSize: "0.6rem", color: "#5F5E5A", marginTop: 4 }}>
                  {status.length}/50
                </div>
              </div>
            </div>

            {/* THE CHAPTERS */}
            <div
              ref={(el) => { sectionRefs.current["chapters"] = el; }}
              className="relative"
              style={{ marginBottom: 28 }}
              onMouseEnter={() => setActiveSection("chapters")}
              onMouseLeave={() => setActiveSection(null)}
            >
              <NodeDot hasData={timelineSections[2].hasData} isLive={false} />
              <NarrativeLabel title="THE CHAPTERS" timing="~8s" isActive={activeSection === "chapters"} id="chapters" />
              <div style={{ background: "#0F0F0E", border: "1px solid #1C1B19", borderRadius: 12, padding: 14 }}>
                <SocializeLinksCard
                  links={links}
                  onRemoveLink={handleRemoveLink}
                  onEditLink={handleEditLink}
                  onReorder={handleReorderLinks}
                />
                <SocializeAddLinkButton onClick={() => setShowAddModal(true)} />
              </div>
            </div>

            {/* BREAKING NEWS */}
            <div
              ref={(el) => { sectionRefs.current["breaking"] = el; }}
              className="relative"
              style={{ marginBottom: 28 }}
              onMouseEnter={() => setActiveSection("breaking")}
              onMouseLeave={() => setActiveSection(null)}
            >
              <NodeDot hasData={timelineSections[3].hasData} isLive={timelineSections[3].isLive} />
              <NarrativeLabel title="BREAKING NEWS" timing="~2s" isActive={activeSection === "breaking"} id="breaking" />
              <div style={{ background: "#0F0F0E", border: "1px solid #1C1B19", borderRadius: 12, padding: 14 }}>
                {userData?.notifications && userData.notifications.length > 0 ? (
                  <div className="space-y-3">
                    {userData.notifications.filter((n) => !isNotificationExpired(n)).map((notification, index) => (
                      <SocializeNotificationCard
                        key={`${index}-${notification.message}`}
                        message={notification.message}
                        duration={notification.duration}
                        timestamp={notification.timestamp}
                        expiresAt={notification.expiresAt}
                        onEdit={() => {
                          setEditingNotificationIndex(index);
                          setMessage(notification.message);
                          setDuration(notification.duration);
                          setShowUpdatePopup(true);
                        }}
                        onDelete={() => deleteNotificationMutation.mutate({ notificationIndex: index })}
                        isDeleting={deleteNotificationMutation.isPending && deleteNotificationMutation.variables?.notificationIndex === index}
                      />
                    ))}
                  </div>
                ) : null}
                <button
                  onClick={() => {
                    setEditingNotificationIndex(null);
                    setMessage("");
                    setDuration(1);
                    setShowUpdatePopup(true);
                  }}
                  style={{
                    width: "100%",
                    marginTop: 10,
                    padding: "6px 12px",
                    borderRadius: 7,
                    border: "1px dashed #282724",
                    background: "transparent",
                    color: "#7A776E",
                    fontFamily: "var(--font-plus-jakarta-sans), system-ui, sans-serif",
                    fontSize: "0.75rem",
                    fontWeight: 500,
                    cursor: "pointer",
                    transition: "all 0.25s cubic-bezier(.16,1,.3,1)",
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.borderColor = "#D4A652"; e.currentTarget.style.color = "#D4A652"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.borderColor = "#282724"; e.currentTarget.style.color = "#7A776E"; }}
                >
                  + New
                </button>
              </div>
            </div>

            {/* THE SIGNATURE */}
            <div
              ref={(el) => { sectionRefs.current["signature"] = el; }}
              className="relative"
              style={{ marginBottom: 28 }}
              onMouseEnter={() => setActiveSection("signature")}
              onMouseLeave={() => setActiveSection(null)}
            >
              <NodeDot hasData={true} isLive={false} />
              <NarrativeLabel title="THE SIGNATURE" timing="~1s" isActive={activeSection === "signature"} id="signature" />
              <div>
                <div style={{ fontFamily: "var(--font-plus-jakarta-sans)", fontSize: "0.72rem", fontWeight: 500, color: "#5F5E5A", letterSpacing: "0.08em", textTransform: "uppercase" as const, marginBottom: 10 }}>
                  ACCENT COLOR
                </div>
                <div style={{ display: "flex", gap: 12 }}>
                  {(["gold", "cyan", "rose", "green", "purple", "coral"] as const).map((color) => {
                    const palette: Record<string, string> = { gold: "#D4A652", cyan: "#5CB8CC", rose: "#D088B4", green: "#5EC97E", purple: "#9088D4", coral: "#D46A5C" };
                    return (
                      <div
                        key={color}
                        onClick={() => {
                          setAccentColor(color);
                          updateUserDataMutation.mutate({ accentColor: color });
                        }}
                        style={{
                          width: 24, height: 24, borderRadius: "50%",
                          background: palette[color],
                          border: accentColor === color ? "2px solid #ECE9E1" : "2px solid transparent",
                          cursor: "pointer",
                          transition: "all 0.25s cubic-bezier(.16,1,.3,1)",
                          boxShadow: accentColor === color ? `0 0 8px ${palette[color]}40` : "none",
                          display: "flex", alignItems: "center", justifyContent: "center",
                          fontSize: "0.65rem", fontWeight: 800, color: "#0B0B0A",
                        }}
                      >
                        {accentColor === color ? "✓" : ""}
                      </div>
                    );
                  })}
                </div>
              </div>
              <div style={{ marginTop: 16 }}>
                <SocializeShareBar
                  uniqueUsername={uniqueUsername}
                  onShare={(platform) => {
                    if (platform === "copy") {
                      toast({ title: "Success", description: "URL copied to clipboard", variant: "default", duration: 4000 });
                    }
                  }}
                />
              </div>
            </div>

            <TimelineEnd />
          </TimelineSpine>
        </div>

        {/* Right: Phone Preview (xl+ only) */}
        <div className="hidden xl:flex" style={{
          position: "sticky", top: 80,
          height: "calc(100vh - 120px)",
          display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
          borderLeft: "1px solid #1C1B19",
          paddingLeft: 36,
        }}>
          <div style={{ fontFamily: "var(--font-plus-jakarta-sans)", fontSize: "0.72rem", fontWeight: 500, color: "#5F5E5A", letterSpacing: "0.08em", textTransform: "uppercase" as const, marginBottom: 16 }}>
            VISITOR&apos;S JOURNEY
          </div>
          <div style={{ position: "relative" }}>
            <SyncDots activeSection={activeSection} />
            <SocializePreview
              logo={user && "imageUrl" in user ? (user.imageUrl ?? null) : null}
              profileTitle={uniqueUsername}
              bio={bio || userData?.bio || ""}
              links={links || []}
              banner={banner}
              status={status}
              accentColor={accentColor}
              notifications={(userData?.notifications || []).filter(n => !isNotificationExpired(n))}
            />
          </div>
          <div style={{ marginTop: 14, textAlign: "center" }}>
            <div style={{ fontFamily: "var(--font-jetbrains-mono)", fontSize: 12, color: "#B5B2A8", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
              insturix.com/profile/{uniqueUsername}
            </div>
            {userData?.updatedAt ? (
              <div style={{ fontFamily: "var(--font-jetbrains-mono)", fontSize: 11, color: "#7A776E", marginTop: 4 }}>
                Updated {relativeTime(userData.updatedAt)}
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {/* Modals */}
      <Dialog open={showAddModal} onOpenChange={setShowAddModal}>
        <DialogContent className="text-[#EAE9E5] p-6 border-social-line" style={{ backgroundColor: '#0F0F0E', borderRadius: '12px' }}>
          <DialogHeader className="pb-4">
            <DialogTitle className="flex items-center gap-2 text-[18px] font-medium">
              <Plus className="w-5 h-5" style={{ color: '#D4A652' }} />
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
                className="border-transparent focus:border-[#D4A652] focus:ring-0 text-[#EAE9E5]" style={{ backgroundColor: '#0F0F0E' }}
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
                className="border-transparent focus:border-[#D4A652] focus:ring-0 text-[#EAE9E5]" style={{ backgroundColor: '#0F0F0E' }}
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
                <SelectTrigger className="border-transparent focus:border-[#D4A652] focus:ring-0" style={{ backgroundColor: '#0F0F0E' }}>
                  <SelectValue placeholder="Select platform" />
                </SelectTrigger>
                <SelectContent className="border-social-line" style={{ backgroundColor: '#0F0F0E' }}>
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
              disabled={!newLink.url.trim() || updateUserDataMutation.isPending}
              className={`${newLink.url.trim()
                ? "text-social-canvas font-jetbrains uppercase tracking-[0.05em] rounded-[7px] border-none hover:opacity-90 transition-opacity"
                : "bg-social-well text-social-muted cursor-not-allowed rounded-[7px] border-none"
                }`}
              style={{ backgroundColor: newLink.url.trim() ? '#D4A652' : undefined }}
            >
              {updateUserDataMutation.isPending ? "Adding..." : "Add Link"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showEditBioModal} onOpenChange={setShowEditBioModal}>
        <DialogContent className="text-[#EAE9E5] p-6 border-social-line" style={{ backgroundColor: '#0F0F0E', borderRadius: '12px' }}>
          <DialogHeader className="pb-4">
            <DialogTitle className="text-[18px] font-medium">Edit Bio</DialogTitle>
            <DialogDescription>Update your profile bio</DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm text-gray-400">Bio</label>
              <Textarea
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                placeholder="Tell people about yourself..."
                className="border-transparent focus:border-[#D4A652] focus:ring-0 text-[#EAE9E5] resize-none" style={{ backgroundColor: '#0F0F0E' }}
                rows={3}
                maxLength={80}
              />
              <div className="flex justify-end text-[11px] text-gray-400">
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
              disabled={updateUserDataMutation.isPending}
              className="text-[#EAE9E5] rounded-[7px] border-none hover:opacity-90 transition-opacity"
              style={{ backgroundColor: '#D4A652' }}
            >
              {updateUserDataMutation.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showUpdatePopup} onOpenChange={setShowUpdatePopup}>
        <DialogContent className="text-[#EAE9E5] p-6 border-social-line" style={{ backgroundColor: '#0F0F0E', borderRadius: '12px' }}>
          <DialogHeader className="pb-4">
            <DialogTitle className="flex items-center gap-2 text-[18px] font-medium">
              <Bell className="w-5 h-5" style={{ color: '#D4A652' }} />
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
                className="border-transparent focus:border-[#D4A652] focus:ring-0 text-[#EAE9E5]" style={{ backgroundColor: '#0F0F0E' }}
              />
              <p className="text-[11px] text-gray-400">Between 1 and 24 hours</p>
            </div>

            <div className="space-y-2">
              <label className="text-sm text-gray-400">Message</label>
              <Textarea
                value={message}
                onChange={(e) => setMessage(e.target.value.slice(0, 150))}
                placeholder="Enter your notification message..."
                className="border-transparent focus:border-[#D4A652] focus:ring-0 text-[#EAE9E5] resize-none" style={{ backgroundColor: '#0F0F0E' }}
                rows={3}
                maxLength={150}
              />
              <div className="flex justify-end text-[11px] text-gray-400">
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
                Number(duration) > 24 ||
                updateUserDataMutation.isPending
              }
              className={cn("text-[#EAE9E5] rounded-[7px] border-none transition-opacity", 
                (message && duration !== "" && Number(duration) >= 1 && Number(duration) <= 24)
                ? "hover:opacity-90"
                : "opacity-50 cursor-not-allowed"
              )}
              style={{ backgroundColor: (message && duration !== "" && Number(duration) >= 1 && Number(duration) <= 24) ? '#D4A652' : '#1B1A18' }}
            >
              {updateUserDataMutation.isPending ? "Saving..." : "Save Notification"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Link Modal */}
      <Dialog open={showEditLinkModal} onOpenChange={setShowEditLinkModal}>
        <DialogContent className="text-[#EAE9E5] p-6 border-social-line" style={{ backgroundColor: '#0F0F0E', borderRadius: '12px' }}>
          <DialogHeader className="pb-4">
            <DialogTitle className="flex items-center gap-2 text-[18px] font-medium">
              <Plus className="w-5 h-5" style={{ color: '#D4A652' }} />
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
                  className="border-transparent focus:border-[#D4A652] focus:ring-0 text-[#EAE9E5]" style={{ backgroundColor: '#0F0F0E' }}
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
                  className="border-transparent focus:border-[#D4A652] focus:ring-0 text-[#EAE9E5]" style={{ backgroundColor: '#0F0F0E' }}
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
                  <SelectTrigger className="border-transparent focus:border-[#D4A652] focus:ring-0" style={{ backgroundColor: '#0F0F0E' }}>
                    <SelectValue placeholder="Select platform" />
                  </SelectTrigger>
                  <SelectContent className="border-social-line" style={{ backgroundColor: '#0F0F0E' }}>
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
              disabled={!editingLink?.url.trim() || updateUserDataMutation.isPending}
              className={cn("text-[#EAE9E5] rounded-[7px] border-none transition-opacity", 
                editingLink?.url.trim()
                ? "hover:opacity-90"
                : "opacity-50 cursor-not-allowed"
              )}
              style={{ backgroundColor: editingLink?.url.trim() ? '#D4A652' : '#1B1A18' }}
            >
              {updateUserDataMutation.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
