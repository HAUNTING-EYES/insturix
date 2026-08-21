"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { useUploaderXUpload, type UploaderXPublishReceipt } from "@/hooks/useUploaderXUpload";
import { isUploaderXFieldSupported } from "@/lib/uploaderx/platform-capabilities";
import { detectPostTypes, validatePostType, type VideoMetadata } from "@/lib/uploaderx/platform-rules";
import { useUser, useClerk, useReverification } from "@clerk/nextjs";
import { useGSAP } from "@gsap/react";
import { gsap } from "@/lib/animation/gsap-config";
import { DURATIONS, STAGGER } from "@/lib/animation/presets";
import { ScheduleCalendar } from "./ScheduleCalendar";

// ─── Design tokens (Insturix design system) ───────────────────
const C = {
  bg: "#0B0B0A", raised: "#0F0F0E", deeper: "#131312", well: "#1B1A18",
  border: "#1C1B19", borderL: "#282724",
  t1: "#ECE9E1", t2: "#B5B2A8", t3: "#7A776E", t4: "#5F5E5A", t5: "#454340",
  gold: "#D4A652", goldH: "#C49840", goldBg: "rgba(212,166,82,.08)", goldBd: "rgba(212,166,82,.16)",
  green: "#5EC97E", red: "#D46A5C", purple: "#9088D4", pink: "#D088B4",
} as const;
const EASE = "cubic-bezier(.16,1,.3,1)";
const UNSUPPORTED_CONTROL_TITLE = "Not wired to publishing yet";

// ─── Types ─────────────────────────────────────────────────────
type ViewState = "floor" | "library" | "fragmentation" | "reveal";
type PlatformConnectionState = "connected" | "disconnected" | "reconnect" | "attention";

interface PlatformStatus {
  key: string;
  label: string;
  connected: boolean;
  connectionState?: PlatformConnectionState;
  statusMessage?: string;
  userName?: string;
  authUrl: string;
  aspect: string;
  fmt?: string;
  statusUrl?: string;
}

interface VideoItem {
  videoUuid: string;
  filename: string;
  publicUrl: string;
  fileSize: number;
  uploadedAt: string;
  status: string;
  platforms?: string[];
  editronProjectId?: string | null;
  metadata?: Record<string, unknown>;
}

function normalizeVideoListResponse(data: unknown): VideoItem[] {
  const records = Array.isArray(data)
    ? data
    : data && typeof data === "object" && Array.isArray((data as { videos?: unknown }).videos)
      ? (data as { videos: unknown[] }).videos
      : [];

  return records.map((record) => {
    const video = record as Partial<VideoItem> & { size?: number };
    return {
      ...video,
      videoUuid: video.videoUuid || "",
      filename: video.filename || "Untitled video",
      publicUrl: video.publicUrl || "",
      fileSize: video.fileSize ?? video.size ?? 0,
      uploadedAt: video.uploadedAt || new Date().toISOString(),
      status: video.status || "uploaded",
      platforms: video.platforms || [],
      metadata: video.metadata || {},
    };
  }).filter((video) => video.videoUuid);
}

// ─── Platform definitions ──────────────────────────────────────
const PLATFORMS = [
  { key: "youtube", label: "YouTube", statusUrl: "", authUrl: "", aspect: "16:9", fmt: "Native video post" },
  { key: "instagram", label: "Instagram", statusUrl: "/api/services/uploaderx/instagram/status", authUrl: "/api/services/uploaderx/instagram/auth", aspect: "9:16", fmt: "Reel · vertical crop" },
  { key: "facebook", label: "Facebook", statusUrl: "/api/services/uploaderx/facebook/pages", authUrl: "/api/services/uploaderx/facebook/auth", aspect: "16:9", fmt: "Video post" },
  { key: "twitter", label: "X", statusUrl: "/api/services/uploaderx/twitter/status", authUrl: "/api/services/uploaderx/twitter/auth", aspect: "16:9", fmt: "Post · native" },
  { key: "linkedin", label: "LinkedIn", statusUrl: "/api/services/uploaderx/linkedin/status", authUrl: "/api/services/uploaderx/linkedin/auth", aspect: "1:1", fmt: "Native video post" },
] as const;

function formatPublishPath(path?: string) {
  switch (path) {
    case "linkedin-rest-text":
      return "REST text";
    case "linkedin-rest-media":
      return "REST media";
    case "linkedin-legacy-media":
      return "Legacy media";
    case "linkedin-existing-text":
      return "Existing text";
    case "linkedin-existing-media":
      return "Existing media";
    default:
      return path;
  }
}

function compactPlatformId(id?: string) {
  if (!id) return undefined;
  return id.length > 24 ? `...${id.slice(-21)}` : id;
}

// ─── Pipeline stages ───────────────────────────────────────────
const STAGES = [
  { key: "script", label: "Script" },
  { key: "edit", label: "Edit" },
  { key: "analyze", label: "Analyze" },
  { key: "thumbnails", label: "Thumbnails" },
  { key: "publish", label: "Publish" },
  { key: "share", label: "Share" },
] as const;

function extractVideoMetadata(file: File): Promise<VideoMetadata> {
  return new Promise((resolve) => {
    const video = document.createElement("video");
    video.preload = "metadata";
    video.muted = true;
    video.playsInline = true;
    const url = URL.createObjectURL(file);
    video.src = url;
    video.onloadedmetadata = () => {
      URL.revokeObjectURL(url);
      const duration = video.duration;
      const width = video.videoWidth;
      const height = video.videoHeight;
      const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
      const divisor = gcd(width, height);
      const rWidth = width / divisor;
      const rHeight = height / divisor;
      const aspectRatio = `${rWidth}:${rHeight}`;
      let orientation: "vertical" | "horizontal" | "square" = "horizontal";
      if (height > width) {
        orientation = "vertical";
      } else if (width === height) {
        orientation = "square";
      }
      resolve({
        duration,
        width,
        height,
        aspectRatio,
        orientation,
        fileSize: file.size,
      });
    };
    video.onerror = () => {
      URL.revokeObjectURL(url);
      resolve({
        duration: 0,
        width: 0,
        height: 0,
        aspectRatio: "16:9",
        orientation: "horizontal",
        fileSize: file.size,
      });
    };
  });
}

function extractVideoMetadataFromUrl(url: string): Promise<Omit<VideoMetadata, "fileSize">> {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    video.preload = "metadata";
    video.muted = true;
    video.playsInline = true;
    video.src = url;
    video.onloadedmetadata = () => {
      const duration = video.duration;
      const width = video.videoWidth;
      const height = video.videoHeight;
      const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
      const divisor = gcd(width, height);
      const rWidth = width / divisor;
      const rHeight = height / divisor;
      const aspectRatio = `${rWidth}:${rHeight}`;
      let orientation: "vertical" | "horizontal" | "square" = "horizontal";
      if (height > width) {
        orientation = "vertical";
      } else if (width === height) {
        orientation = "square";
      }
      resolve({
        duration,
        width,
        height,
        aspectRatio,
        orientation,
      });
    };
    video.onerror = () => {
      reject(new Error("Failed to load video metadata from URL"));
    };
  });
}

export function UploaderXClientWrapper() {
  const { toast } = useToast();
  const { user } = useUser();
  const { openUserProfile } = useClerk();
  const createExternalAccountWithVerification = useReverification(
    (params: { strategy: string; redirectUrl: string; additionalScopes: string[] }) =>
      user?.createExternalAccount(params as any)
  );
  const [view, setView] = useState<ViewState>("floor");
  const [platformStatuses, setPlatformStatuses] = useState<PlatformStatus[]>([]);
  const [videos, setVideos] = useState<VideoItem[]>([]);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [selectedVideo, setSelectedVideo] = useState<VideoItem | null>(null);
  const [videoMetadata, setVideoMetadata] = useState<VideoMetadata | null>(null);
  const [selectedPostTypes, setSelectedPostTypes] = useState<Record<string, string>>({});
  const [userOverriddenPlatforms, setUserOverriddenPlatforms] = useState<Set<string>>(new Set());
  const [loadingPlatforms, setLoadingPlatforms] = useState(true);
  const [loadingVideos, setLoadingVideos] = useState(true);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dropZoneRef = useRef<HTMLDivElement>(null);
  const uxPageRef = useRef<HTMLDivElement>(null);

  // GSAP entrance — staggered fadeUp for main floor sections
  useGSAP(() => {
    gsap.fromTo('[data-ux-animate]',
      { y: 24, opacity: 0 },
      { y: 0, opacity: 1, duration: DURATIONS.atmosphere, ease: 'expo.out', stagger: { each: STAGGER.wide.each, from: 'start' } }
    );
  }, { scope: uxPageRef });
  const [isDragging, setIsDragging] = useState(false);
  const [armedPlatforms, setArmedPlatforms] = useState<Set<string>>(new Set());
  const [publishResults, setPublishResults] = useState<Record<string, UploaderXPublishReceipt>>({});
  const [isPublishing, setIsPublishing] = useState(false);
  const [uploadedGcsPath, setUploadedGcsPath] = useState<string | null>(null);
  const [uploadedVideoUuid, setUploadedVideoUuid] = useState<string | null>(null);
  const { uploadWithProgress, uploadThumbnail, uploadToYouTube, uploadToFacebook, uploadToInstagram, uploadToTwitter, uploadToLinkedIn, isUploading, uploadProgress } = useUploaderXUpload();

  // ─── Metadata state ──────────────────────────────────────────
  const [metaTitle, setMetaTitle] = useState("");
  const [metaDescription, setMetaDescription] = useState("");
  const [metaTags, setMetaTags] = useState("");
  const [metaPrivacy, setMetaPrivacy] = useState<"public" | "unlisted" | "private">("public");
  const [metaVideoType, setMetaVideoType] = useState<"short" | "long">("short");
  const [metaThumbnail, setMetaThumbnail] = useState<File | null>(null);
  const [metaSchedule, setMetaSchedule] = useState("");
  const [showPerPlatform, setShowPerPlatform] = useState(false);
  const thumbnailInputRef = useRef<HTMLInputElement>(null);

  // Per-platform overrides
  const [ytCategory, setYtCategory] = useState("22"); // People & Blogs
  const [igCaption, setIgCaption] = useState("");
  const [igLocation, setIgLocation] = useState("");
  const [fbMessage, setFbMessage] = useState("");
  const [fbPrivacy, setFbPrivacy] = useState<"everyone" | "friends" | "only_me">("everyone");
  const [xReplySettings, setXReplySettings] = useState<"everyone" | "following" | "mentionedUsers" | "subscribers" | "verified">("everyone");
  const [liPostType, setLiPostType] = useState<"personal" | "organization">("personal");

  // ✅ Add this useEffect block for YouTube token capture
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get("token");
    if (token) {
      localStorage.setItem("youtube_token", token);
      toast({
        title: "YouTube connected!",
        description: "You're ready to upload videos.",
      });

      // 🧹 Clean up token from the URL
      window.history.replaceState({}, document.title, "/dashboard/uploaderx");
    }
  }, [toast]);

  // ✅ Handle Facebook connection feedback from callback
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const fbConnected = params.get("fb_connected");
    const fbError = params.get("fb_error");
    const fbWarning = params.get("fb_warning");

    if (fbConnected === "true") {
      if (fbWarning === "no_pages") {
        toast({
          title: "Facebook connected, but no Pages found",
          description: "You don't have any Facebook Pages. Create a Page at facebook.com/pages/create and reconnect.",
          variant: "destructive",
        });
      } else {
        toast({
          title: "Facebook connected!",
          description: "You can now upload videos to your Facebook Pages.",
        });
      }
      window.history.replaceState({}, document.title, "/dashboard/uploaderx");
    } else if (fbError) {
      let errorMsg = "Failed to connect Facebook.";
      if (fbError === "denied") errorMsg = "Facebook connection was denied. Please try again.";
      if (fbError === "token_exchange") errorMsg = "Facebook token exchange failed. Please try again.";
      if (fbError === "pages_fetch") errorMsg = "Could not fetch your Facebook Pages. Please ensure you have admin access.";
      toast({
        title: "Facebook Connection Error",
        description: errorMsg,
        variant: "destructive",
      });
      window.history.replaceState({}, document.title, "/dashboard/uploaderx");
    }
  }, [toast]);

  // ✅ Handle Instagram connection feedback from callback
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const igConnected = params.get("ig_connected");
    const igError = params.get("ig_error");

    if (igConnected === "true") {
      toast({
        title: "Instagram connected!",
        description: "You can now publish Reels to your Instagram Business account.",
      });
      window.history.replaceState({}, document.title, "/dashboard/uploaderx");
    } else if (igError) {
      let errorMsg = "Failed to connect Instagram.";
      if (igError === "denied") errorMsg = "Instagram connection was denied. Please try again.";
      if (igError === "token_exchange") errorMsg = "Instagram token exchange failed. Please try again.";
      if (igError === "pages_fetch") errorMsg = "Could not fetch your Facebook Pages. Please ensure you have admin access.";
      if (igError === "no_accounts") errorMsg = "No Instagram Business accounts found connected to your Facebook Pages.";
      toast({
        title: "Instagram Connection Error",
        description: errorMsg,
        variant: "destructive",
      });
      window.history.replaceState({}, document.title, "/dashboard/uploaderx");
    }
  }, [toast]);

  // ✅ Handle Twitter connection feedback from callback
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const twitterConnected = params.get("twitter_connected");
    const twitterError = params.get("twitter_error");
    const twitterScopesWarning = params.get("twitter_scopes_warning");

    if (twitterConnected === "true") {
      toast({
        title: "Twitter connected!",
        description: "You can now post videos to your Twitter/X account.",
      });

      // Show warning if some permissions are missing
      if (twitterScopesWarning) {
        const missingScopes = twitterScopesWarning.split(",");
        toast({
          title: "⚠️ Missing Permissions",
          description: `Some permissions were not granted: ${missingScopes.join(", ")}. Some features may not work correctly.`,
          variant: "destructive",
        });
      }

      window.history.replaceState({}, document.title, "/dashboard/uploaderx");
    } else if (twitterError) {
      let errorMsg = "Failed to connect Twitter.";
      if (twitterError === "denied") errorMsg = "Twitter connection was denied. Please try again.";
      if (twitterError === "token_exchange") errorMsg = "Twitter token exchange failed. Please try again.";
      if (twitterError === "state_mismatch") errorMsg = "Security validation failed. Please try again.";
      if (twitterError === "no_verifier") errorMsg = "OAuth session expired. Please try again.";
      if (twitterError === "profile_fetch") errorMsg = "Could not fetch your Twitter profile. Please try again.";
      toast({
        title: "Twitter Connection Error",
        description: errorMsg,
        variant: "destructive",
      });
      window.history.replaceState({}, document.title, "/dashboard/uploaderx");
    }
  }, [toast]);

  // ✅ Handle LinkedIn connection feedback from callback
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const linkedinConnected = params.get("success") === "linkedin_connected";
    const linkedinError = params.get("error");

    if (linkedinConnected) {
      toast({
        title: "LinkedIn connected!",
        description: "You can now post content to LinkedIn.",
      });
      // Don't clean the URL - let LinkedInConnectionStatus handle the cleanup
    } else if (linkedinError) {
      let errorMsg = "Failed to connect LinkedIn.";
      const message = params.get("message");
      if (message) errorMsg = decodeURIComponent(message);
      if (linkedinError === "denied") errorMsg = "LinkedIn connection was denied. Please try again.";
      if (linkedinError === "token_exchange") errorMsg = "LinkedIn token exchange failed. Please try again.";
      if (linkedinError === "profile_fetch") errorMsg = "Could not fetch your LinkedIn profile. Please try again.";
      toast({
        title: "LinkedIn Connection Error",
        description: errorMsg,
        variant: "destructive",
      });
      // Clean up error from URL
      const newUrl = new URL(window.location.href);
      newUrl.searchParams.delete('error');
      newUrl.searchParams.delete('message');
      window.history.replaceState({}, document.title, newUrl.toString());
    }
  }, [toast]);

  // ─── Fetch platform connection statuses ───────────────────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoadingPlatforms(true);
      const statuses: PlatformStatus[] = [];

      // YouTube — check via Clerk external accounts (no API endpoint)
      const googleAccount = user?.externalAccounts.find(
        (acc) => acc.provider === "google" || (acc.provider as string) === "oauth_google"
      );
      const ytScope = "https://www.googleapis.com/auth/youtube.upload";
      const ytConnected = !!googleAccount && (googleAccount.approvedScopes?.includes(ytScope) !== false);
      const youtubePlatform = PLATFORMS[0];
      statuses.push({
        ...youtubePlatform,
        connected: ytConnected,
        connectionState: ytConnected ? "connected" : "disconnected",
        userName: googleAccount?.emailAddress || undefined,
      });

      // Fetch other platforms in parallel
      const fetches = PLATFORMS.filter(p => p.statusUrl).map(async (p): Promise<PlatformStatus> => {
        try {
          const res = await fetch(p.statusUrl, { credentials: "include" });
          if (!res.ok) {
            return {
              ...p,
              connected: false,
              connectionState: "attention",
              statusMessage: "Connection status is temporarily unavailable.",
            };
          }
          const data = await res.json();
          const connected = Boolean(data.connected);
          const connectionState: PlatformConnectionState =
            data.connectionState === "connected" ||
            data.connectionState === "disconnected" ||
            data.connectionState === "reconnect" ||
            data.connectionState === "attention"
              ? data.connectionState
              : connected
                ? "connected"
                : "disconnected";
          return {
            ...p,
            connected,
            connectionState,
            statusMessage: typeof data.message === "string" ? data.message : undefined,
            userName: data.userName || data.name || undefined,
          };
        } catch {
          return {
            ...p,
            connected: false,
            connectionState: "attention",
            statusMessage: "Connection status is temporarily unavailable.",
          };
        }
      });

      const results = await Promise.all(fetches);
      if (!cancelled) {
        setPlatformStatuses([statuses[0], ...results]);
        setLoadingPlatforms(false);
      }
    })();
    return () => { cancelled = true; };
  }, [user]);

  // ─── Fetch recent videos ─────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoadingVideos(true);
      try {
        const res = await fetch("/api/services/uploaderx/videos", { credentials: "include" });
        if (res.ok) {
          const data = await res.json();
          if (!cancelled) setVideos(normalizeVideoListResponse(data).slice(0, 50));
        }
      } catch { /* silent — empty list */ }
      if (!cancelled) setLoadingVideos(false);
    })();
    return () => { cancelled = true; };
  }, []);

  // ─── File handling ───────────────────────────────────────────
  const handleFile = useCallback(async (file: File) => {
    if (!file.type.startsWith("video/")) {
      toast({ title: "Invalid file", description: "Please upload a video file (MP4, MOV, WebM).", variant: "destructive" });
      return;
    }
    setSelectedFile(file);
    // A new video = a fresh publish run: drop the previous run's receipts and
    // uploaded artifacts (they are what the fragmentation view's arm logic
    // reads to decide retry-only arming).
    setPublishResults({});
    setUploadedGcsPath(null);
    setUploadedVideoUuid(null);
    try {
      const meta = await extractVideoMetadata(file);
      setVideoMetadata(meta);
      const detection = detectPostTypes(meta);
      const initialPostTypes: Record<string, string> = {};
      Object.entries(detection).forEach(([key, val]) => {
        initialPostTypes[key] = val.recommended;
      });
      setSelectedPostTypes(initialPostTypes);
      setUserOverriddenPlatforms(new Set());
    } catch (err) {
      console.error("Failed to extract metadata:", err);
    }
  }, [toast]);

  const handleSelectVideo = useCallback(async (video: VideoItem) => {
    setSelectedVideo(video);
    setView("fragmentation");
    
    const dbMeta = video.metadata?.videoMetadata as VideoMetadata | undefined;
    if (dbMeta && dbMeta.duration && dbMeta.width) {
      setVideoMetadata(dbMeta);
      const detection = detectPostTypes(dbMeta);
      const initialPostTypes: Record<string, string> = {};
      Object.entries(detection).forEach(([key, val]) => {
        initialPostTypes[key] = val.recommended;
      });
      setSelectedPostTypes(initialPostTypes);
      setUserOverriddenPlatforms(new Set());
    } else {
      if (video.publicUrl) {
        try {
          const meta = await extractVideoMetadataFromUrl(video.publicUrl);
          const completeMeta = { ...meta, fileSize: video.fileSize };
          setVideoMetadata(completeMeta);
          const detection = detectPostTypes(completeMeta);
          const initialPostTypes: Record<string, string> = {};
          Object.entries(detection).forEach(([key, val]) => {
            initialPostTypes[key] = val.recommended;
          });
          setSelectedPostTypes(initialPostTypes);
          setUserOverriddenPlatforms(new Set());
        } catch {
          const fallbackMeta: VideoMetadata = {
            duration: 60,
            width: 1920,
            height: 1080,
            aspectRatio: "16:9",
            orientation: "horizontal",
            fileSize: video.fileSize,
          };
          setVideoMetadata(fallbackMeta);
          const detection = detectPostTypes(fallbackMeta);
          const initialPostTypes: Record<string, string> = {};
          Object.entries(detection).forEach(([key, val]) => {
            initialPostTypes[key] = val.recommended;
          });
          setSelectedPostTypes(initialPostTypes);
          setUserOverriddenPlatforms(new Set());
        }
      }
    }
  }, []);

  const handleSelectScheduledVideo = useCallback((videoUuid: string) => {
    const video = videos.find((item) => item.videoUuid === videoUuid);
    if (video) {
      void handleSelectVideo(video);
    }
  }, [handleSelectVideo, videos]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const handleConnect = useCallback(async (platform: PlatformStatus) => {
    if (platform.key === "youtube") {
      const YT_SCOPE = "https://www.googleapis.com/auth/youtube.upload";
      const googleAccount = user?.externalAccounts.find(
        (acc) => acc.provider === "google" || (acc.provider as string) === "oauth_google"
      );

      try {
        if (googleAccount?.approvedScopes?.includes(YT_SCOPE)) {
          toast({ title: "YouTube connected", description: "Your Google account has YouTube permissions." });
          return;
        }
        if (googleAccount) {
          const reauth = await googleAccount.reauthorize({
            redirectUrl: `${window.location.origin}/dashboard/uploaderx`,
            additionalScopes: [YT_SCOPE],
          });
          if (reauth.verification?.externalVerificationRedirectURL) {
            window.location.href = reauth.verification.externalVerificationRedirectURL.toString();
          }
        } else {
          await createExternalAccountWithVerification({
            strategy: "oauth_google",
            redirectUrl: `${window.location.origin}/dashboard/uploaderx`,
            additionalScopes: [YT_SCOPE],
          });
        }
      } catch (err) {
        console.error("[YouTube connect]", err);
        toast({
          title: "YouTube connection issue",
          description: "Could not connect automatically. Try connecting Google from your account settings.",
          variant: "destructive",
        });
        openUserProfile();
      }
    } else if (platform.authUrl) {
      window.location.href = platform.authUrl;
    }
  }, [user, openUserProfile, toast, createExternalAccountWithVerification]);

  const RESET_ENDPOINTS: Record<string, string> = {
    youtube: "clerk",
    instagram: "/api/services/uploaderx/instagram/reset",
    facebook: "/api/services/uploaderx/facebook/reset",
    twitter: "/api/services/uploaderx/twitter/reset",
    linkedin: "/api/services/uploaderx/linkedin/reset",
  };

  const handleDisconnect = useCallback(async (platform: PlatformStatus) => {
    if (platform.key === "youtube") {
      try {
        const googleAccount = user?.externalAccounts.find(
          (acc) => acc.provider === "google" || (acc.provider as string) === "oauth_google"
        );
        if (googleAccount) {
          await googleAccount.destroy();
          // Force refresh user data to ensure externalAccounts is updated
          await user?.reload();
          toast({ title: "YouTube disconnected", description: "Your Google account has been disconnected." });
          setPlatformStatuses((prev) => prev.map((p) => p.key === "youtube" ? { ...p, connected: false, userName: undefined } : p));
        } else {
          toast({ title: "YouTube disconnected", description: "No connected Google account found." });
          setPlatformStatuses((prev) => prev.map((p) => p.key === "youtube" ? { ...p, connected: false, userName: undefined } : p));
        }
      } catch (err) {
        console.error("Failed to disconnect YouTube:", err);
        toast({ 
          title: "Disconnect failed", 
          description: err instanceof Error ? err.message : "Could not disconnect Google account. Try from your account settings.", 
          variant: "destructive" 
        });
      }
      return;
    }

    const resetUrl = RESET_ENDPOINTS[platform.key];
    if (!resetUrl) return;
    try {
      const res = await fetch(resetUrl, { method: "POST" });
      if (res.ok) {
        toast({ title: `${platform.label} disconnected`, description: "You can reconnect anytime." });
        setPlatformStatuses((prev) => prev.map((p) => p.key === platform.key ? { ...p, connected: false, userName: undefined } : p));
      }
    } catch {
      toast({ title: "Disconnect failed", description: "Please try again.", variant: "destructive" });
    }
  }, [toast, user]);

  const connectedCount = platformStatuses.filter(p => p.connected).length;

  // ─── Helper: format file size ────────────────────────────────
  const fmtSize = (bytes: number) => {
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(0) + " KB";
    return (bytes / (1024 * 1024)).toFixed(1) + " MB";
  };

  const fmtDate = (d: string) => {
    const date = new Date(d);
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  };

  // ─── Auto-arm when entering fragmentation ─────────────────────
  // After a partial failure, re-entering must arm ONLY the failed platforms:
  // the old behaviour re-armed everything (and wiped the receipts), so
  // "retry" double-posted to every platform that had already succeeded.
  // Results are kept here and cleared only when a new video is selected.
  useEffect(() => {
    if (view === "fragmentation") {
      const failed = Object.entries(publishResults)
        .filter(([, r]) => r && !r.success)
        .map(([key]) => key);
      if (failed.length > 0) {
        setArmedPlatforms(new Set(failed));
      } else if (Object.keys(publishResults).length === 0) {
        const connected = new Set(platformStatuses.filter(p => p.connected).map(p => p.key));
        setArmedPlatforms(connected);
      } else {
        // Everything already succeeded — nothing should be armed by default.
        setArmedPlatforms(new Set());
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, platformStatuses]);

  const toggleArm = useCallback((key: string) => {
    setArmedPlatforms(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }, []);

  // ─── Publish to all armed platforms ──────────────────────────
  const handlePublish = useCallback(async () => {
    setIsPublishing(true);

    // Validate selections first
    if (videoMetadata) {
      for (const key of armedPlatforms) {
        const selectedType = selectedPostTypes[key] || "video";
        const validation = validatePostType(key, selectedType, videoMetadata);
        if (!validation.valid) {
          toast({
            title: "Validation Error",
            description: validation.error || `This video is not eligible for ${key}.`,
            variant: "destructive",
          });
          setIsPublishing(false);
          return;
        }
      }
    }

    let gcsPath = uploadedGcsPath;
    let videoUuid = uploadedVideoUuid;
    const title = metaTitle || selectedFile?.name || selectedVideo?.filename || "Untitled";
    const description = metaDescription;
    const ytTitle = title;
    const ytDesc = description;

    // Step 1: Upload file to R2 if needed
    if (selectedFile && !gcsPath) {
      const result = await uploadWithProgress(selectedFile, undefined, {
        title,
        description,
        tags: metaTags.split(",").map(t => t.trim()).filter(Boolean),
        privacyStatus: metaPrivacy,
        // Driven by the visible Short/Long toggle (metaVideoType) — it used to
        // write state nothing read, while this line read a value the toggle
        // never set. One control, one source.
        videoType: metaVideoType,
        videoMetadata: videoMetadata || undefined,
      });
      if (!result.success) {
        toast({ title: "Upload failed", description: result.error || "Could not upload video", variant: "destructive" });
        setIsPublishing(false);
        return;
      }
      gcsPath = result.gcsPath || null;
      videoUuid = result.videoUuid || null;
      setUploadedGcsPath(gcsPath);
      setUploadedVideoUuid(videoUuid);
    } else if (selectedVideo) {
      gcsPath = selectedVideo.publicUrl || null;
      videoUuid = selectedVideo.videoUuid;
    }

    if (!gcsPath || !videoUuid) {
      toast({ title: "No video", description: "Select or upload a video first.", variant: "destructive" });
      setIsPublishing(false);
      return;
    }

    const results: Record<string, UploaderXPublishReceipt> = {};

    // Step 2: Publish to each armed platform with proper metadata
    for (const key of armedPlatforms) {
      try {
        let res: UploaderXPublishReceipt;
        switch (key) {
          case "youtube": {
            let thumbnailPublicUrl: string | undefined;
            if (metaThumbnail) {
              const thumbnailResult = await uploadThumbnail(metaThumbnail);
              if (!thumbnailResult.success || !thumbnailResult.publicUrl) {
                res = { success: false, platform: "youtube", step: "thumbnail", error: thumbnailResult.error || "Thumbnail upload failed" };
                break;
              }
              thumbnailPublicUrl = thumbnailResult.publicUrl;
            }

            res = await uploadToYouTube(
              videoUuid,
              gcsPath,
              selectedFile?.name || selectedVideo?.filename || "video",
              ytTitle,
              ytDesc,
              metaPrivacy,
              ytCategory,
              metaSchedule ? new Date(metaSchedule).toISOString() : undefined,
              thumbnailPublicUrl,
              selectedPostTypes["youtube"] || "video",
              videoMetadata?.duration,
            );
            break;
          }
          case "facebook":
            res = await uploadToFacebook(
              videoUuid,
              gcsPath,
              title,
              fbMessage || description,
              undefined,
              selectedPostTypes["facebook"] || "reel",
              videoMetadata?.duration,
              metaSchedule ? new Date(metaSchedule).toISOString() : undefined,
            );
            break;
          case "instagram":
            res = await uploadToInstagram(
              videoUuid,
              gcsPath,
              title,
              igCaption || description,
              undefined,
              selectedPostTypes["instagram"] || "reel",
              videoMetadata?.duration,
            );
            break;
          case "twitter":
            res = await uploadToTwitter(
              videoUuid,
              gcsPath,
              title,
              description,
              xReplySettings,
              selectedPostTypes["twitter"] || "video",
              videoMetadata?.duration,
            );
            break;
          case "linkedin":
            res = await uploadToLinkedIn(
              videoUuid,
              gcsPath,
              title,
              description,
              liPostType,
              undefined,
              selectedPostTypes["linkedin"] || "video",
              videoMetadata?.duration,
            );
            break;
          default:
            res = { success: false, platform: key as UploaderXPublishReceipt["platform"], error: "Unknown platform" };
        }
        results[key] = res;
      } catch (err) {
        results[key] = { success: false, platform: key as UploaderXPublishReceipt["platform"], error: err instanceof Error ? err.message : "Failed" };
      }
      setPublishResults({ ...results });
    }

    setIsPublishing(false);
    setView("reveal");
  }, [armedPlatforms, selectedFile, selectedVideo, uploadedGcsPath, uploadedVideoUuid, uploadWithProgress, uploadThumbnail, uploadToYouTube, uploadToFacebook, uploadToInstagram, uploadToTwitter, uploadToLinkedIn, toast, metaTitle, metaDescription, metaTags, metaPrivacy, metaVideoType, metaThumbnail, metaSchedule, ytCategory, fbMessage, igCaption, xReplySettings, liPostType, videoMetadata, selectedPostTypes]);

  const armedCount = armedPlatforms.size;

  // ═══════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════

  return (
    <div ref={uxPageRef} style={{ fontFamily: "var(--font-sans, 'Plus Jakarta Sans', sans-serif)" }}>

      {/* ━━━ FLOOR VIEW ━━━ */}
      {view === "floor" && (
        <div style={{ display: "flex", flexDirection: "column", minHeight: "70vh" }}>

          {/* Pipeline breadcrumb */}
          <div data-ux-animate style={{ display: "flex", alignItems: "center", gap: 4, padding: "14px 0", borderBottom: `1px solid ${C.border}`, marginBottom: 24, overflowX: "auto", opacity: 0 }}>
            {STAGES.map((s, i) => {
              // Earlier steps are UPSTREAM of this page, not verifiably "done" —
              // the old `isDone = i < 4` painted them green-complete for every
              // video regardless of reality. Neutral for prior, gold for here.
              const isPrior = i < 4;
              const isCurrent = s.key === "publish";
              return (
                <React.Fragment key={s.key}>
                  {i > 0 && <span style={{ color: C.t5, fontSize: 10, margin: "0 2px" }}>→</span>}
                  <span style={{
                    display: "flex", alignItems: "center", gap: 6,
                    padding: "5px 12px", borderRadius: 5,
                    fontFamily: "var(--font-mono, 'JetBrains Mono', monospace)", fontSize: 10, letterSpacing: ".04em",
                    color: isCurrent ? C.gold : isPrior ? C.t3 : C.t5,
                    background: isCurrent ? C.goldBg : "transparent",
                    border: isCurrent ? `1px solid ${C.goldBd}` : "1px solid transparent",
                    whiteSpace: "nowrap",
                  }}>
                    <span style={{
                      width: 5, height: 5, borderRadius: 3, flexShrink: 0,
                      background: isCurrent ? C.gold : isPrior ? C.t3 : C.t5,
                      boxShadow: isCurrent ? "0 0 4px rgba(212,166,82,.25)" : "none",
                    }} />
                    {s.label}
                  </span>
                </React.Fragment>
              );
            })}
          </div>

          {/* Upload zone — direct upload */}
          {!selectedFile ? (
            <div
              ref={dropZoneRef}
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
              style={{
                border: `1.5px dashed ${isDragging ? C.gold : C.borderL}`,
                borderStyle: isDragging ? "solid" : "dashed",
                borderRadius: 12, padding: "28px", display: "flex", alignItems: "center", gap: 20,
                marginBottom: 24, cursor: "pointer",
                background: isDragging ? C.goldBg : "transparent",
                transition: `all .4s ${EASE}`,
              }}
            >
              <div style={{
                width: 48, height: 48, borderRadius: 12,
                border: `1px solid ${C.borderL}`, background: C.deeper,
                display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
              }}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={C.t4} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" />
                </svg>
              </div>
              <div>
                <div style={{ fontSize: 14, fontWeight: 500, color: C.t2, marginBottom: 3 }}>Drop a video or click to browse</div>
                <div style={{ fontSize: 12, color: C.t5 }}>MP4, MOV, WebM · Up to 2 GB</div>
              </div>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: C.t5, letterSpacing: ".06em", marginLeft: "auto" }}>
                or drag & drop
              </span>
              <input ref={fileInputRef} type="file" accept="video/*" style={{ display: "none" }} onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFile(f);
              }} />
            </div>
          ) : (
            /* Uploaded file preview */
            <div style={{
              border: `1px solid ${C.goldBd}`, borderRadius: 12, padding: "16px 20px",
              display: "flex", alignItems: "center", gap: 16, marginBottom: 24, background: C.raised,
            }}>
              <div style={{
                width: 40, height: 40, borderRadius: 8, background: C.goldBg, border: `1px solid ${C.goldBd}`,
                display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
              }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={C.gold} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="23 7 16 12 23 17 23 7" /><rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
                </svg>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 500, color: C.t1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {selectedFile.name}
                </div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: C.t4, marginTop: 2 }}>
                  {fmtSize(selectedFile.size)} · {selectedFile.type.split("/")[1]?.toUpperCase() || "VIDEO"}
                </div>
              </div>
              <button onClick={() => { setSelectedFile(null); if (fileInputRef.current) fileInputRef.current.value = ""; }} style={{
                fontSize: 12, color: C.t5, background: "none", border: "none", cursor: "pointer", fontFamily: "inherit",
              }}>
                Change
              </button>
              <button onClick={() => setView("fragmentation")} style={{
                background: C.gold, color: C.bg, border: "none", padding: "8px 20px", borderRadius: 7,
                fontWeight: 800, fontSize: 12, cursor: "pointer", fontFamily: "inherit",
                transition: `all .2s ${EASE}`,
              }}>
                Publish
              </button>
            </div>
          )}

          {/* Divider */}
          <div data-ux-animate style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24, opacity: 0 }}>
            <div style={{ flex: 1, height: 1, background: C.border }} />
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: C.t5, letterSpacing: ".08em", textTransform: "uppercase" as const }}>
              from pipeline
            </span>
            <div style={{ flex: 1, height: 1, background: C.border }} />
          </div>

          {/* Hero card — most recent unpublished video from pipeline */}
          {videos.length > 0 && videos[0].status !== "live" ? (
            <div style={{
              border: `1px solid ${C.goldBd}`, borderRadius: 12, background: C.raised,
              padding: 24, display: "flex", gap: 20, marginBottom: 32, position: "relative", overflow: "hidden",
            }}>
              {/* Glow */}
              <div style={{ position: "absolute", inset: -40, background: "radial-gradient(circle at 30% 50%,rgba(212,166,82,.03) 0%,transparent 60%)", pointerEvents: "none" }} />
              {/* Badge */}
              <div style={{
                position: "absolute", top: 12, right: 16,
                fontFamily: "var(--font-mono)", fontSize: 9, color: C.gold, letterSpacing: ".06em", textTransform: "uppercase" as const,
                padding: "3px 8px", borderRadius: 4, background: C.goldBg, border: `1px solid ${C.goldBd}`,
              }}>
                Ready to publish
              </div>
              {/* Thumbnail */}
              <div style={{
                width: 200, height: 114, borderRadius: 8, background: C.deeper, border: `1px solid ${C.border}`,
                flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={C.t5} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="5 3 19 12 5 21 5 3" />
                </svg>
              </div>
              {/* Info */}
              <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", flex: 1, minWidth: 0, position: "relative", zIndex: 1 }}>
                <div style={{ fontSize: 18, fontWeight: 800, color: C.t1, letterSpacing: "-.02em", marginBottom: 4 }}>
                  {videos[0].filename}
                </div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: C.t4, display: "flex", gap: 10, marginBottom: 12 }}>
                  <span>{fmtSize(videos[0].fileSize)}</span>
                  <span>{String(videos[0].metadata?.format || "H.264")}</span>
                </div>
                <div style={{ fontSize: 13, color: C.t3, marginBottom: 16, lineHeight: 1.5 }}>
                  {connectedCount} platform{connectedCount !== 1 ? "s" : ""} connected · Ready to distribute
                </div>
                <button onClick={() => handleSelectVideo(videos[0])} style={{
                  background: C.gold, color: C.bg, border: "none", padding: "10px 24px", borderRadius: 7,
                  fontWeight: 800, fontSize: 13, cursor: "pointer", fontFamily: "inherit", alignSelf: "flex-start",
                  transition: `all .2s ${EASE}`,
                }}>
                  Publish this
                </button>
              </div>
            </div>
          ) : !loadingVideos && videos.length === 0 ? (
            <div style={{
              border: `1px solid ${C.border}`, borderRadius: 12, background: C.raised,
              padding: "32px 24px", textAlign: "center", marginBottom: 32,
            }}>
              <div style={{ fontSize: 14, color: C.t3, marginBottom: 4 }}>No videos in pipeline yet</div>
              <div style={{ fontSize: 12, color: C.t5 }}>Upload a video above or produce one from the Edit room</div>
            </div>
          ) : null}

          {/* Recent videos */}
          {videos.length > 0 && (
            <>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: C.t5, letterSpacing: ".08em", textTransform: "uppercase" as const }}>
                  Recent
                </span>
                <button onClick={() => setView("library")} style={{
                  fontSize: 12, color: C.t4, background: "none", border: "none", cursor: "pointer", fontFamily: "inherit",
                  transition: `color .2s ${EASE}`,
                }}
                  onMouseEnter={(e) => { e.currentTarget.style.color = C.gold; }}
                  onMouseLeave={(e) => { e.currentTarget.style.color = C.t4; }}
                >
                  View all →
                </button>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 32 }}>
                {videos.slice(0, 5).map((v) => (
                  <div
                    key={v.videoUuid}
                    onClick={() => handleSelectVideo(v)}
                    style={{
                      display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", borderRadius: 7,
                      border: `1px solid ${C.border}`, background: C.raised, cursor: "pointer",
                      transition: `all .25s ${EASE}`,
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.borderColor = C.borderL; e.currentTarget.style.transform = "translateX(4px)"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.borderColor = C.border; e.currentTarget.style.transform = "translateX(0)"; }}
                  >
                    <div style={{ width: 48, height: 28, borderRadius: 4, background: C.deeper, border: `1px solid ${C.border}`, flexShrink: 0 }} />
                    <span style={{ fontSize: 13, fontWeight: 500, color: C.t2, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {v.filename}
                    </span>
                    <span style={{
                      fontFamily: "var(--font-mono)", fontSize: 10,
                      color: v.status === "ready" || v.platforms?.length ? C.green : C.t4,
                    }}>
                      {v.platforms?.length ? "LIVE" : v.status?.toUpperCase() || "DRAFT"}
                    </span>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: C.t5 }}>
                      {fmtDate(v.uploadedAt)}
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}

          <ScheduleCalendar videos={videos} onSelectVideo={handleSelectScheduledVideo} />

          {/* Platform health strip */}
          <div style={{ display: "flex", gap: 16, padding: "16px 0", borderTop: `1px solid ${C.border}`, marginTop: "auto" }}>
            {loadingPlatforms ? (
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: C.t5 }}>Checking connections...</span>
            ) : (
              platformStatuses.map((p) => (
                <div
                  key={p.key}
                  title={p.statusMessage}
                  style={{ display: "flex", alignItems: "center", gap: 6, transition: "opacity .2s" }}
                >
                  <span style={{
                    width: 6, height: 6, borderRadius: 3,
                    background: p.connectionState === "attention" ? C.gold : p.connected ? C.green : C.red,
                    boxShadow: p.connectionState === "attention"
                      ? "0 0 4px rgba(212,166,82,.2)"
                      : p.connected
                        ? "0 0 4px rgba(94,201,126,.2)"
                        : "none",
                  }} />
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: C.t4, letterSpacing: ".04em" }}>
                    {p.label}
                    {p.connectionState === "attention"
                      ? " - temporarily unavailable"
                      : p.connectionState === "reconnect"
                        ? " - reconnect"
                        : ""}
                  </span>
                  {p.connected && RESET_ENDPOINTS[p.key] ? (
                    <button
                      onClick={() => handleDisconnect(p)}
                      style={{
                        fontSize: 9, color: C.t5, background: "none", border: `1px solid ${C.border}`,
                        padding: "1px 6px", borderRadius: 3, cursor: "pointer", fontFamily: "var(--font-mono)",
                        transition: `all .2s ${EASE}`, lineHeight: 1.4,
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.color = C.red; e.currentTarget.style.borderColor = C.red; }}
                      onMouseLeave={(e) => { e.currentTarget.style.color = C.t5; e.currentTarget.style.borderColor = C.border; }}
                    >
                      ×
                    </button>
                  ) : !p.connected && p.connectionState !== "attention" ? (
                    <button
                      onClick={() => handleConnect(p)}
                      style={{
                        fontSize: 9, color: C.gold, background: "none", border: `1px solid ${C.goldBd}`,
                        padding: "1px 6px", borderRadius: 3, cursor: "pointer", fontFamily: "var(--font-mono)",
                        transition: `all .2s ${EASE}`, lineHeight: 1.4,
                      }}
                    >
                      {p.connectionState === "reconnect" ? "reconnect" : "connect"}
                    </button>
                  ) : null}
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* ━━━ FRAGMENTATION VIEW ━━━ */}
      {view === "fragmentation" && (
        <div style={{ display: "flex", flexDirection: "column", minHeight: "70vh" }}>

          {/* Topbar */}
          <div style={{ display: "flex", alignItems: "center", padding: "12px 0", borderBottom: `1px solid ${C.border}`, gap: 12, marginBottom: 24 }}>
            <button onClick={() => { setView("floor"); setUploadedGcsPath(null); setUploadedVideoUuid(null); setVideoMetadata(null); setSelectedPostTypes({}); }} style={{
              display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", color: C.t4,
              fontFamily: "inherit", fontSize: 13, cursor: "pointer", padding: "6px 10px", borderRadius: 6,
              transition: `all .2s ${EASE}`,
            }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
              Back
            </button>
            <span style={{ fontWeight: 800, fontSize: 14, letterSpacing: "-.01em" }}>
              {selectedFile?.name || selectedVideo?.filename || "Untitled"}
            </span>
            <span style={{
              fontFamily: "var(--font-mono)", fontSize: 10, color: C.gold, letterSpacing: ".06em",
              marginLeft: "auto", padding: "3px 10px", borderRadius: 4, background: C.goldBg, border: `1px solid ${C.goldBd}`,
            }}>
              Select destinations
            </span>
          </div>

          {/* Split layout */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", flex: 1, gap: 0 }}>

            {/* Source side */}
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 32, borderRight: `1px solid ${C.border}`, position: "relative" }}>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: C.t5, letterSpacing: ".1em", textTransform: "uppercase" as const, position: "absolute", top: 0, left: 0 }}>
                Source
              </span>
              <div style={{
                width: "100%", maxWidth: 360, aspectRatio: "16/9", borderRadius: 12,
                background: C.deeper, border: `1px solid ${C.border}`, position: "relative", overflow: "hidden",
                transition: `all .8s ${EASE}`,
                ...(isPublishing ? { opacity: 0.3, transform: "scale(.92)", filter: "blur(3px)" } : {}),
              }}>
                <div style={{ position: "absolute", inset: -40, background: "radial-gradient(circle at center,rgba(212,166,82,.03) 0%,transparent 60%)" }} />
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", position: "relative", zIndex: 1 }}>
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke={C.t5} strokeWidth="1.5"><polygon points="5 3 19 12 5 21 5 3" /></svg>
                </div>
              </div>
              <div style={{ marginTop: 20, textAlign: "center" }}>
                <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: "-.03em", color: C.t1 }}>
                  {selectedFile?.name || selectedVideo?.filename || "Untitled"}
                </div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: C.t4, marginTop: 6, display: "flex", gap: 12, justifyContent: "center" }}>
                  <span>{fmtSize(selectedFile?.size || selectedVideo?.fileSize || 0)}</span>
                  <span>{selectedFile?.type?.split("/")[1]?.toUpperCase() || "H.264"}</span>
                </div>
              </div>
              {/* Upload progress */}
              {isUploading && uploadProgress && (
                <div style={{ marginTop: 16, width: "100%", maxWidth: 360 }}>
                  <div style={{ height: 3, background: C.well, borderRadius: 2, overflow: "hidden" }}>
                    <div style={{ height: "100%", borderRadius: 2, background: C.gold, width: `${uploadProgress.percentage}%`, transition: `width .3s ${EASE}` }} />
                  </div>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: C.t4, marginTop: 4, textAlign: "center" }}>
                    Uploading... {uploadProgress.percentage}%
                  </div>
                </div>
              )}
            </div>

            {/* Destinations side */}
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 32, gap: 10, position: "relative" }}>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: C.t5, letterSpacing: ".1em", textTransform: "uppercase" as const, position: "absolute", top: 0, left: 0 }}>
                Destinations
              </span>

              {PLATFORMS.map((p) => {
                const status = platformStatuses.find(s => s.key === p.key);
                const connected = status?.connected || false;
                const armed = armedPlatforms.has(p.key);

                return (
                  <div
                    key={p.key}
                    onClick={() => connected && toggleArm(p.key)}
                    style={{
                      display: "flex", alignItems: "center", gap: 16, width: "100%", maxWidth: 380,
                      padding: "14px 16px", borderRadius: 8, cursor: connected ? "pointer" : "default",
                      border: `1px solid ${armed ? C.goldBd : C.border}`,
                      background: armed ? C.goldBg : C.raised,
                      opacity: connected ? 1 : 0.5,
                      transition: `all .3s ${EASE}`,
                    }}
                  >
                    {/* Aspect ratio preview */}
                    <div style={{
                      flexShrink: 0, background: C.deeper, border: `1px solid ${armed ? C.goldBd : C.border}`,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontFamily: "var(--font-mono)", fontSize: 9, color: armed ? C.gold : C.t5,
                      borderRadius: 4, overflow: "hidden",
                      width: p.aspect === "9:16" ? 36 : p.aspect === "1:1" ? 48 : 64,
                      height: p.aspect === "9:16" ? 64 : p.aspect === "1:1" ? 48 : 36,
                      transition: `all .3s ${EASE}`,
                    }}>
                      {p.aspect}
                    </div>

                    {/* Info */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 4 }}>
                        <span style={{ fontSize: 14, fontWeight: 500, color: armed ? C.t1 : connected ? C.t3 : C.t5, transition: "color .2s" }}>
                          {p.label}
                        </span>
                        {connected && videoMetadata && (() => {
                          const platformKey = p.key === "twitter" ? "x" : p.key;
                          const detection = detectPostTypes(videoMetadata)[platformKey as keyof ReturnType<typeof detectPostTypes>];
                          if (!detection) return null;
                          const availableTypes = detection.available;
                          const currentSelection = selectedPostTypes[p.key] || detection.recommended;
                          const isAuto = !userOverriddenPlatforms.has(p.key);
                          return (
                            <>
                              {availableTypes.length > 1 ? (
                                <select
                                  value={currentSelection}
                                  onClick={(e) => e.stopPropagation()}
                                  onChange={(e) => {
                                    e.stopPropagation();
                                    const nextVal = e.target.value;
                                    setSelectedPostTypes(prev => ({ ...prev, [p.key]: nextVal }));
                                    setUserOverriddenPlatforms(prev => {
                                      const next = new Set(prev);
                                      next.add(p.key);
                                      return next;
                                    });
                                  }}
                                  style={{
                                    background: C.deeper,
                                    border: `1px solid ${armed ? C.goldBd : C.borderL}`,
                                    borderRadius: 4,
                                    padding: "2px 6px",
                                    fontSize: 11,
                                    color: armed ? C.gold : C.t2,
                                    fontFamily: "inherit",
                                    outline: "none",
                                    cursor: "pointer",
                                    marginLeft: 4,
                                  }}
                                >
                                  {availableTypes.map(t => (
                                    <option key={t} value={t}>
                                      {t === "short" ? "Short" : t === "feed_video" ? "Feed Video" : t === "reel" ? "Reel" : "Video"}
                                    </option>
                                  ))}
                                </select>
                              ) : (
                                <span style={{ fontSize: 11, color: armed ? C.t2 : C.t4, marginLeft: 4, fontWeight: 500 }}>
                                  ✓ {currentSelection === "video" ? "Video Post" : currentSelection}
                                </span>
                              )}
                              {isAuto && (
                                <span style={{ fontSize: 9, color: C.gold, opacity: 0.8, background: C.goldBg, border: `1px solid ${C.goldBd}`, borderRadius: 3, padding: "1px 4px", marginLeft: 4, fontFamily: "var(--font-mono)" }}>
                                  Auto
                                </span>
                              )}
                            </>
                          );
                        })()}
                      </div>
                      <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: C.t5, marginTop: 4 }}>
                        {connected ? (
                          videoMetadata ? (
                            (() => {
                              const platformKey = p.key === "twitter" ? "x" : p.key;
                              const detection = detectPostTypes(videoMetadata)[platformKey as keyof ReturnType<typeof detectPostTypes>];
                              return detection?.reason || p.fmt;
                            })()
                          ) : p.fmt
                        ) : (
                          "Not connected"
                        )}
                      </div>
                    </div>

                    {/* Connection dot + toggle or connect button */}
                    {connected ? (
                      <>
                        <span style={{ width: 6, height: 6, borderRadius: 3, background: C.green, boxShadow: "0 0 6px rgba(94,201,126,.3)", flexShrink: 0 }} />
                        <div style={{
                          width: 36, height: 20, borderRadius: 10, position: "relative", flexShrink: 0,
                          background: armed ? C.goldBg : C.well,
                          border: `1px solid ${armed ? C.goldBd : C.border}`,
                          transition: `all .3s ${EASE}`,
                        }}>
                          <div style={{
                            position: "absolute", top: 2, width: 14, height: 14, borderRadius: "50%",
                            left: armed ? 18 : 2,
                            background: armed ? C.gold : C.t4,
                            transition: `all .3s ${EASE}`,
                          }} />
                        </div>
                      </>
                    ) : (
                      <>
                        <span style={{ width: 6, height: 6, borderRadius: 3, background: C.red, flexShrink: 0 }} />
                        <button onClick={(e) => { e.stopPropagation(); if (status) handleConnect(status); }} style={{
                          fontSize: 11, color: C.gold, background: "none", border: `1px solid ${C.goldBd}`,
                          padding: "4px 12px", borderRadius: 5, cursor: "pointer", fontFamily: "inherit",
                          transition: `all .2s ${EASE}`,
                        }}>
                          Connect
                        </button>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* ── Metadata section ── */}
          <div style={{ borderTop: `1px solid ${C.border}`, padding: "20px 0", marginTop: 16 }}>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: C.t5, letterSpacing: ".08em", textTransform: "uppercase" as const, marginBottom: 16 }}>
              Details
            </div>

            {/* Row 1: Title + Video type */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 12, marginBottom: 12 }}>
              <input
                value={metaTitle}
                onChange={(e) => setMetaTitle(e.target.value)}
                placeholder="Title (uses filename if empty)"
                style={{
                  background: C.raised, border: `1px solid ${C.border}`, borderRadius: 7, padding: "10px 14px",
                  fontSize: 14, color: C.t1, fontFamily: "inherit", outline: "none", width: "100%",
                  transition: `border-color .2s ${EASE}`,
                }}
                onFocus={(e) => { e.currentTarget.style.borderColor = C.gold; }}
                onBlur={(e) => { e.currentTarget.style.borderColor = C.border; }}
              />
              <div style={{ display: "flex", borderRadius: 7, border: `1px solid ${C.border}`, overflow: "hidden" }}>
                {(["short", "long"] as const).map(t => (
                  <button key={t} onClick={() => setMetaVideoType(t)} style={{
                    padding: "10px 16px", fontSize: 12, fontWeight: metaVideoType === t ? 800 : 400,
                    color: metaVideoType === t ? C.gold : C.t4,
                    background: metaVideoType === t ? C.goldBg : C.raised,
                    border: "none", cursor: "pointer", fontFamily: "inherit",
                    transition: `all .2s ${EASE}`,
                  }}>
                    {t === "short" ? "Short" : "Long"}
                  </button>
                ))}
              </div>
            </div>

            {/* Row 2: Description */}
            <textarea
              value={metaDescription}
              onChange={(e) => setMetaDescription(e.target.value)}
              placeholder="Description (optional)"
              rows={3}
              style={{
                background: C.raised, border: `1px solid ${C.border}`, borderRadius: 7, padding: "10px 14px",
                fontSize: 13, color: C.t1, fontFamily: "inherit", outline: "none", width: "100%",
                resize: "vertical", marginBottom: 12, lineHeight: 1.5,
                transition: `border-color .2s ${EASE}`,
              }}
              onFocus={(e) => { e.currentTarget.style.borderColor = C.gold; }}
              onBlur={(e) => { e.currentTarget.style.borderColor = C.border; }}
            />

            {/* Row 3: Tags + Privacy + Thumbnail */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr auto auto", gap: 12, marginBottom: 12 }}>
              <input
                value={metaTags}
                onChange={(e) => setMetaTags(e.target.value)}
                placeholder="Tags (comma separated)"
                style={{
                  background: C.raised, border: `1px solid ${C.border}`, borderRadius: 7, padding: "10px 14px",
                  fontSize: 13, color: C.t1, fontFamily: "inherit", outline: "none", width: "100%",
                  transition: `border-color .2s ${EASE}`,
                }}
                onFocus={(e) => { e.currentTarget.style.borderColor = C.gold; }}
                onBlur={(e) => { e.currentTarget.style.borderColor = C.border; }}
              />
              <select
                value={metaPrivacy}
                onChange={(e) => setMetaPrivacy(e.target.value as "public" | "unlisted" | "private")}
                style={{
                  background: C.raised, border: `1px solid ${C.border}`, borderRadius: 7, padding: "10px 14px",
                  fontSize: 12, color: C.t2, fontFamily: "inherit", outline: "none", cursor: "pointer",
                  appearance: "none", minWidth: 100,
                }}
              >
                <option value="public">Public</option>
                <option value="unlisted">Unlisted</option>
                <option value="private">Private</option>
              </select>
              <button
                disabled={!isUploaderXFieldSupported("youtube", "thumbnail")}
                title={isUploaderXFieldSupported("youtube", "thumbnail") ? "Upload YouTube thumbnail" : UNSUPPORTED_CONTROL_TITLE}
                onClick={() => {
                  if (isUploaderXFieldSupported("youtube", "thumbnail")) {
                    thumbnailInputRef.current?.click();
                  }
                }}
                style={{
                  background: C.raised, border: `1px solid ${C.border}`, borderRadius: 7, padding: "10px 14px",
                  fontSize: 12, color: metaThumbnail ? C.green : C.t4,
                  cursor: isUploaderXFieldSupported("youtube", "thumbnail") ? "pointer" : "not-allowed",
                  fontFamily: "inherit",
                  opacity: isUploaderXFieldSupported("youtube", "thumbnail") ? 1 : 0.55,
                  display: "flex", alignItems: "center", gap: 6, whiteSpace: "nowrap",
                  transition: `all .2s ${EASE}`,
                }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
                {metaThumbnail ? "Thumbnail selected" : "Upload thumbnail"}
              </button>
              <input ref={thumbnailInputRef} type="file" accept="image/png,image/jpeg" style={{ display: "none" }} onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) setMetaThumbnail(f);
              }} />
            </div>

            {/* Row 4: Schedule (optional) */}
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
              <input
                type="datetime-local"
                value={metaSchedule}
                disabled={!isUploaderXFieldSupported("youtube", "publishAt")}
                title={isUploaderXFieldSupported("youtube", "publishAt") ? "Schedule YouTube publish" : UNSUPPORTED_CONTROL_TITLE}
                onChange={(e) => setMetaSchedule(e.target.value)}
                style={{
                  background: C.raised, border: `1px solid ${C.border}`, borderRadius: 7, padding: "10px 14px",
                  fontSize: 12, color: metaSchedule ? C.t2 : C.t5, fontFamily: "inherit", outline: "none",
                  cursor: isUploaderXFieldSupported("youtube", "publishAt") ? "text" : "not-allowed",
                  opacity: isUploaderXFieldSupported("youtube", "publishAt") ? 1 : 0.55,
                  colorScheme: "dark",
                  transition: `border-color .2s ${EASE}`,
                }}
                onFocus={(e) => { e.currentTarget.style.borderColor = C.gold; }}
                onBlur={(e) => { e.currentTarget.style.borderColor = C.border; }}
              />
              <span style={{ fontSize: 12, color: C.t5 }}>{metaSchedule ? "Scheduled on YouTube" : "Schedule on YouTube"}</span>
              {metaSchedule && (
                <button onClick={() => setMetaSchedule("")} style={{ fontSize: 11, color: C.t4, background: "none", border: "none", cursor: "pointer" }}>Clear</button>
              )}
            </div>

            {/* Per-platform overrides (collapsible) */}
            <button
              onClick={() => setShowPerPlatform(!showPerPlatform)}
              style={{
                fontSize: 12, color: C.t4, background: "none", border: "none", cursor: "pointer",
                fontFamily: "inherit", display: "flex", alignItems: "center", gap: 6, padding: "4px 0",
              }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ transform: showPerPlatform ? "rotate(90deg)" : "none", transition: "transform .2s" }}>
                <polyline points="9 18 15 12 9 6" />
              </svg>
              Per-platform overrides
            </button>

            {showPerPlatform && (
              <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 12, padding: "16px", background: C.deeper, borderRadius: 8, border: `1px solid ${C.border}` }}>
                {/* YouTube */}
                {armedPlatforms.has("youtube") && (
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 500, color: C.t2, marginBottom: 8 }}>YouTube</div>
                    <select
                      value={ytCategory}
                      disabled={!isUploaderXFieldSupported("youtube", "categoryId")}
                      title={isUploaderXFieldSupported("youtube", "categoryId") ? "YouTube category" : UNSUPPORTED_CONTROL_TITLE}
                      onChange={(e) => setYtCategory(e.target.value)}
                      style={{
                      background: C.raised, border: `1px solid ${C.border}`, borderRadius: 5, padding: "8px 12px",
                      fontSize: 12, color: C.t2, fontFamily: "inherit", outline: "none", width: "100%",
                      cursor: isUploaderXFieldSupported("youtube", "categoryId") ? "pointer" : "not-allowed",
                      opacity: isUploaderXFieldSupported("youtube", "categoryId") ? 1 : 0.55,
                    }}>
                      <option value="22">People & Blogs</option>
                      <option value="24">Entertainment</option>
                      <option value="25">News & Politics</option>
                      <option value="26">Howto & Style</option>
                      <option value="27">Education</option>
                      <option value="28">Science & Technology</option>
                    </select>
                  </div>
                )}
                {/* Instagram */}
                {armedPlatforms.has("instagram") && (
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 500, color: C.t2, marginBottom: 8 }}>Instagram</div>
                    <input value={igCaption} onChange={(e) => setIgCaption(e.target.value)} placeholder="Caption (with hashtags)" style={{
                      background: C.raised, border: `1px solid ${C.border}`, borderRadius: 5, padding: "8px 12px",
                      fontSize: 12, color: C.t1, fontFamily: "inherit", outline: "none", width: "100%", marginBottom: 6,
                    }} />
                    <input
                      value={igLocation}
                      disabled={!isUploaderXFieldSupported("instagram", "location")}
                      title={UNSUPPORTED_CONTROL_TITLE}
                      onChange={(e) => setIgLocation(e.target.value)}
                      placeholder="Location unavailable"
                      style={{
                      background: C.raised, border: `1px solid ${C.border}`, borderRadius: 5, padding: "8px 12px",
                      fontSize: 12, color: C.t1, fontFamily: "inherit", outline: "none", width: "100%",
                      cursor: isUploaderXFieldSupported("instagram", "location") ? "text" : "not-allowed",
                      opacity: isUploaderXFieldSupported("instagram", "location") ? 1 : 0.55,
                    }} />
                  </div>
                )}
                {/* Facebook */}
                {armedPlatforms.has("facebook") && (
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 500, color: C.t2, marginBottom: 8 }}>Facebook</div>
                    <input value={fbMessage} onChange={(e) => setFbMessage(e.target.value)} placeholder="Post message" style={{
                      background: C.raised, border: `1px solid ${C.border}`, borderRadius: 5, padding: "8px 12px",
                      fontSize: 12, color: C.t1, fontFamily: "inherit", outline: "none", width: "100%", marginBottom: 6,
                    }} />
                    <select
                      value={fbPrivacy}
                      disabled={!isUploaderXFieldSupported("facebook", "privacy")}
                      title={UNSUPPORTED_CONTROL_TITLE}
                      onChange={(e) => setFbPrivacy(e.target.value as "everyone" | "friends" | "only_me")}
                      style={{
                      background: C.raised, border: `1px solid ${C.border}`, borderRadius: 5, padding: "8px 12px",
                      fontSize: 12, color: C.t2, fontFamily: "inherit", outline: "none", width: "100%",
                      cursor: isUploaderXFieldSupported("facebook", "privacy") ? "pointer" : "not-allowed",
                      opacity: isUploaderXFieldSupported("facebook", "privacy") ? 1 : 0.55,
                    }}>
                      <option value="everyone">Public</option>
                      <option value="friends">Friends</option>
                      <option value="only_me">Only Me</option>
                    </select>
                  </div>
                )}
                {/* X */}
                {armedPlatforms.has("twitter") && (
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 500, color: C.t2, marginBottom: 8 }}>X</div>
                    <select
                      value={xReplySettings}
                      disabled={!isUploaderXFieldSupported("twitter", "replySettings")}
                      title={isUploaderXFieldSupported("twitter", "replySettings") ? "Who can reply" : UNSUPPORTED_CONTROL_TITLE}
                      onChange={(e) => setXReplySettings(e.target.value as "everyone" | "following" | "mentionedUsers" | "subscribers" | "verified")}
                      style={{
                        background: C.raised, border: `1px solid ${C.border}`, borderRadius: 5, padding: "8px 12px",
                        fontSize: 12, color: C.t2, fontFamily: "inherit", outline: "none", width: "100%",
                        cursor: isUploaderXFieldSupported("twitter", "replySettings") ? "pointer" : "not-allowed",
                        opacity: isUploaderXFieldSupported("twitter", "replySettings") ? 1 : 0.55,
                      }}
                    >
                      <option value="everyone">Everyone can reply</option>
                      <option value="following">Accounts you follow</option>
                      <option value="mentionedUsers">Mentioned accounts</option>
                      <option value="subscribers">Subscribers</option>
                      <option value="verified">Verified accounts</option>
                    </select>
                  </div>
                )}
                {/* LinkedIn */}
                {armedPlatforms.has("linkedin") && (
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 500, color: C.t2, marginBottom: 8 }}>LinkedIn</div>
                    <div style={{ display: "flex", borderRadius: 5, border: `1px solid ${C.border}`, overflow: "hidden" }}>
                      {(["personal", "organization"] as const).map(t => (
                        <button key={t} onClick={() => setLiPostType(t)} style={{
                          flex: 1, padding: "8px 12px", fontSize: 12,
                          fontWeight: liPostType === t ? 800 : 400,
                          color: liPostType === t ? C.gold : C.t4,
                          background: liPostType === t ? C.goldBg : C.raised,
                          border: "none", cursor: "pointer", fontFamily: "inherit",
                        }}>
                          {t === "personal" ? "Personal" : "Organization"}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {armedPlatforms.has("twitter") && videoMetadata && videoMetadata.duration > 140 && (
            <div
              style={{
                padding: "10px 16px",
                borderRadius: 7,
                background: "rgba(212,106,92,.08)",
                border: "1px solid rgba(212,106,92,.3)",
                fontSize: 12,
                color: C.red,
                marginBottom: 12,
                textAlign: "left",
                width: "100%",
                maxWidth: 380,
              }}
            >
              ⚠️ X (Twitter): video is {Math.round(videoMetadata.duration)}s — exceeds the free account limit (2:20). X Premium required.
            </div>
          )}

          {/* Publish bar */}
          <div style={{ padding: "16px 0", borderTop: `1px solid ${C.border}`, display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 16 }}>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: C.t4 }}>
              {armedCount} of {PLATFORMS.length} armed
            </span>
            <button
              onClick={handlePublish}
              disabled={armedCount === 0 || isPublishing}
              style={{
                background: armedCount > 0 ? C.gold : C.t5, color: C.bg,
                fontFamily: "inherit", fontWeight: 800, fontSize: 13, border: "none",
                padding: "10px 28px", borderRadius: 7, cursor: armedCount > 0 ? "pointer" : "not-allowed",
                opacity: armedCount > 0 && !isPublishing ? 1 : 0.4,
                transition: `all .2s ${EASE}`,
              }}
            >
              {isPublishing ? "Publishing..." : `Publish to ${armedCount} platform${armedCount !== 1 ? "s" : ""}`}
            </button>
          </div>
        </div>
      )}

      {/* ━━━ LIBRARY VIEW ━━━ */}
      {view === "library" && (
        <div style={{ display: "flex", flexDirection: "column", minHeight: "70vh" }}>
          {/* Topbar */}
          <div style={{ display: "flex", alignItems: "center", padding: "12px 0", borderBottom: `1px solid ${C.border}`, gap: 12, marginBottom: 24 }}>
            <button onClick={() => setView("floor")} style={{
              display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", color: C.t4,
              fontFamily: "inherit", fontSize: 13, cursor: "pointer", padding: "6px 10px", borderRadius: 6,
            }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
              Back
            </button>
            <span style={{ fontWeight: 800, fontSize: 14 }}>Video Library</span>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: C.t5, marginLeft: "auto" }}>
              {videos.length} video{videos.length !== 1 ? "s" : ""}
            </span>
          </div>

          {/* Video list */}
          {loadingVideos ? (
            <div style={{ textAlign: "center", padding: 48, color: C.t5, fontSize: 13 }}>Loading videos...</div>
          ) : videos.length === 0 ? (
            <div style={{ textAlign: "center", padding: 48 }}>
              <div style={{ fontSize: 14, color: C.t3, marginBottom: 8 }}>No videos yet</div>
              <div style={{ fontSize: 12, color: C.t5 }}>Upload a video to get started</div>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {videos.map((v) => (
                <div
                  key={v.videoUuid}
                  style={{
                    display: "flex", alignItems: "center", gap: 14, padding: "14px 16px", borderRadius: 8,
                    border: `1px solid ${C.border}`, background: C.raised, transition: `all .25s ${EASE}`,
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.borderColor = C.borderL; }}
                  onMouseLeave={(e) => { e.currentTarget.style.borderColor = C.border; }}
                >
                  {/* Thumbnail */}
                  <div style={{
                    width: 64, height: 36, borderRadius: 4, background: C.deeper, border: `1px solid ${C.border}`,
                    flexShrink: 0, overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center",
                  }}>
                    {v.publicUrl ? (
                      <video src={v.publicUrl} style={{ width: "100%", height: "100%", objectFit: "cover" }} muted preload="metadata" />
                    ) : (
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={C.t5} strokeWidth="1.5"><polygon points="5 3 19 12 5 21 5 3" /></svg>
                    )}
                  </div>

                  {/* Info */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 500, color: C.t1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {v.filename}
                    </div>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: C.t5, marginTop: 2, display: "flex", gap: 8 }}>
                      <span>{fmtSize(v.fileSize)}</span>
                      <span>{fmtDate(v.uploadedAt)}</span>
                      {v.platforms && v.platforms.length > 0 && (
                        <span style={{ color: C.green }}>{v.platforms.length} platform{v.platforms.length !== 1 ? "s" : ""}</span>
                      )}
                    </div>
                  </div>

                  {/* Status */}
                  <span style={{
                    fontFamily: "var(--font-mono)", fontSize: 10, padding: "3px 8px", borderRadius: 4,
                    color: v.platforms?.length ? C.green : v.status === "ready" ? C.gold : C.t4,
                    background: v.platforms?.length ? "rgba(94,201,126,.08)" : v.status === "ready" ? C.goldBg : "transparent",
                    border: `1px solid ${v.platforms?.length ? "rgba(94,201,126,.15)" : v.status === "ready" ? C.goldBd : C.border}`,
                  }}>
                    {v.platforms?.length ? "LIVE" : v.status?.toUpperCase() || "DRAFT"}
                  </span>

                  {/* Actions */}
                  <div style={{ display: "flex", gap: 6 }}>
                    <button
                      onClick={() => handleSelectVideo(v)}
                      style={{
                        fontSize: 11, color: C.gold, background: "none", border: `1px solid ${C.goldBd}`,
                        padding: "4px 12px", borderRadius: 5, cursor: "pointer", fontFamily: "inherit",
                      }}
                    >
                      Publish
                    </button>
                    {v.publicUrl && (
                      <a href={v.publicUrl} download={v.filename} style={{
                        fontSize: 11, color: C.t4, background: "none", border: `1px solid ${C.border}`,
                        padding: "4px 10px", borderRadius: 5, textDecoration: "none", display: "flex", alignItems: "center",
                      }}>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ━━━ REVEAL VIEW ━━━ */}
      {view === "reveal" && (() => {
        const resultEntries = Object.entries(publishResults);
        const successCount = resultEntries.filter(([, r]) => r.success).length;
        const failCount = resultEntries.filter(([, r]) => !r.success).length;
        const allDone = resultEntries.length === armedPlatforms.size && resultEntries.length > 0;
        const platformLabel = (key: string) => PLATFORMS.find(p => p.key === key)?.label || key;

        return (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "70vh", padding: "48px 24px", textAlign: "center" }}>

            {/* Status label */}
            <div style={{
              fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: ".12em", textTransform: "uppercase" as const,
              marginBottom: 24, display: "flex", alignItems: "center", gap: 8,
              color: allDone ? (failCount === 0 ? C.green : C.gold) : C.t5,
              transition: `all .6s ${EASE}`,
            }}>
              <span style={{
                width: 6, height: 6, borderRadius: 3,
                background: allDone ? (failCount === 0 ? C.green : C.gold) : C.t5,
                boxShadow: allDone && failCount === 0 ? "0 0 8px rgba(94,201,126,.4)" : "none",
              }} />
              {allDone ? (failCount === 0 ? "Live · Published" : `${successCount} published · ${failCount} failed`) : "Publishing..."}
            </div>

            {/* Title */}
            <div style={{
              fontSize: 48, fontWeight: 800, letterSpacing: "-.04em", lineHeight: 1.05, marginBottom: 8,
              color: allDone && failCount === 0 ? C.gold : C.t1,
              transition: `all 1s ${EASE}`,
            }}>
              {selectedFile?.name || selectedVideo?.filename || "Untitled"}
            </div>
            <div style={{ fontSize: 14, color: C.t3, marginBottom: 48 }}>
              {fmtSize(selectedFile?.size || selectedVideo?.fileSize || 0)}
            </div>

            {/* Platform results */}
            <div style={{ display: "flex", justifyContent: "center", gap: 36, marginBottom: 40 }}>
              {[...armedPlatforms].map((key, i) => {
                const result = publishResults[key];
                const done = Boolean(result);
                const success = result?.success;
                const pathLabel = formatPublishPath(result?.publishPath);
                const postId = compactPlatformId(result?.platformPostId);

                return (
                  <div key={key} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
                    {/* Beam */}
                    <div style={{
                      width: 2, borderRadius: 1, marginBottom: -4,
                      height: done ? (success ? 56 : 32) : 0,
                      background: `linear-gradient(to bottom, ${success ? C.green : done ? C.red : C.gold}, transparent)`,
                      transition: `height .6s ${EASE} ${i * 0.15}s`,
                    }} />
                    {/* Bulb */}
                    <div style={{
                      width: 52, height: 52, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center",
                      fontFamily: "var(--font-mono)", fontSize: 11,
                      background: done ? (success ? "rgba(94,201,126,.04)" : "rgba(212,106,92,.04)") : C.raised,
                      border: `1.5px solid ${done ? (success ? C.green : C.red) : C.goldBd}`,
                      color: done ? (success ? C.green : C.red) : C.gold,
                      boxShadow: done && success ? "0 0 24px rgba(94,201,126,.1)" : "none",
                      transition: `all .4s ${EASE} ${i * 0.15}s`,
                    }}>
                      {done ? (success ? "✓" : "✗") : platformLabel(key).substring(0, 2).toUpperCase()}
                    </div>
                    {/* Label */}
                    <span style={{
                      fontSize: 10,
                      color: done ? (success ? C.green : C.red) : C.t5,
                      transition: `color .3s ${EASE}`,
                    }}>
                      {platformLabel(key)}
                    </span>
                    {/* Error detail */}
                    {result && !result.success && result.error && (
                      <span style={{ fontSize: 9, color: C.red, maxWidth: 100, lineHeight: 1.3, fontFamily: "var(--font-mono)" }}>
                        {result.error.length > 40 ? result.error.slice(0, 40) + "..." : result.error}
                      </span>
                    )}
                    {result && result.success && (pathLabel || postId || result.platformUrl) && (
                      <div style={{
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        gap: 3,
                        maxWidth: 130,
                        fontFamily: "var(--font-mono)",
                        fontSize: 9,
                        lineHeight: 1.35,
                        color: C.t4,
                      }}>
                        {pathLabel && <span>{pathLabel}</span>}
                        {postId && <span title={result.platformPostId}>{postId}</span>}
                        {result.platformUrl && (
                          <a
                            href={result.platformUrl}
                            target="_blank"
                            rel="noreferrer"
                            style={{ color: C.green, textDecoration: "none" }}
                          >
                            Open
                          </a>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Status summary */}
            {allDone && (
              <div style={{
                fontFamily: "var(--font-mono)", fontSize: 11, color: C.t5, marginBottom: 32,
              }}>
                Published to {successCount} platform{successCount !== 1 ? "s" : ""}
                {failCount > 0 ? ` · ${failCount} failed` : ""}
              </div>
            )}

            {/* Analytics placeholder — no backend exists */}
            {allDone && (
              <div style={{
                padding: "16px 24px", borderRadius: 8, border: `1px solid ${C.border}`, background: C.raised,
                marginBottom: 32, maxWidth: 400,
              }}>
                <div style={{ fontSize: 13, color: C.t3, marginBottom: 4 }}>Analytics</div>
                <div style={{ fontSize: 12, color: C.t5 }}>
                  Check back soon with our next update — platform analytics are coming.
                </div>
              </div>
            )}

            {/* Action buttons */}
            {allDone && (
              <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
                <button onClick={() => {
                  setView("floor");
                  setSelectedFile(null);
                  setSelectedVideo(null);
                  setUploadedGcsPath(null);
                  setUploadedVideoUuid(null);
                  setPublishResults({});
                  if (fileInputRef.current) fileInputRef.current.value = "";
                }} style={{
                  background: "transparent", color: C.t3, border: `1px solid ${C.borderL}`,
                  padding: "8px 20px", borderRadius: 7, fontSize: 13, cursor: "pointer", fontFamily: "inherit",
                }}>
                  New Upload
                </button>
                <button onClick={() => setView("floor")} style={{
                  background: C.gold, color: C.bg, border: "none",
                  padding: "10px 28px", borderRadius: 7, fontWeight: 800, fontSize: 13, cursor: "pointer", fontFamily: "inherit",
                  transition: `all .2s ${EASE}`,
                }}>
                  Back to Dashboard
                </button>
              </div>
            )}
          </div>
        );
      })()}
    </div>
  );
}

export default UploaderXClientWrapper;
