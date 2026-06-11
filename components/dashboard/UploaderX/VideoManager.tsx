"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { VideoPlayer } from "./VideoPlayer";
import { PlatformEditor } from "./PlatformEditor";
import {
  Video,
  Search,
  Filter,
  Grid,
  List,
  Upload,
  Edit,
  Trash2,
  Download,
  Calendar,
  FileText,
  RefreshCw,
  Facebook,
  Instagram,
  Youtube,
  Twitter,
  Linkedin
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";


interface VideoItem {
  videoUuid: string;
  filename: string;
  gcsPath: string;
  publicUrl: string;
  fileSize: number;
  uploadedAt: Date;
  status: 'uploaded' | 'processing' | 'ready' | 'error';
  platforms?: string[];
  metadata?: {
    title?: string;
    description?: string;
    duration?: number;
    resolution?: string;
    format?: string;
  };
}

interface VideoManagerProps {
  onUploadNew?: () => void;
  onEditVideo?: (videoUuid: string) => void;
  onDeleteVideo?: (videoUuid: string) => void;
}

export function VideoManager({
  onUploadNew,
  onEditVideo,
  onDeleteVideo
}: VideoManagerProps) {
  const { toast } = useToast();
  const [videos, setVideos] = useState<VideoItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [selectedVideo, setSelectedVideo] = useState<VideoItem | null>(null);
  const [showEditor, setShowEditor] = useState(false);
  const [deletingVideo, setDeletingVideo] = useState<string | null>(null);
  const [showUploadDialog, setShowUploadDialog] = useState(false);
  const [uploadedVideoLink, setUploadedVideoLink] = useState("");
  const [uploadPlatform, setUploadPlatform] = useState("YouTube");

  // Fetch videos from API
  useEffect(() => {
    const fetchVideos = async () => {
      try {
        setLoading(true);
        const response = await fetch('/api/services/uploaderx/videos');

        if (!response.ok) {
          const text = await response.text();
          console.error(`[VideoFetch] Error ${response.status}:`, text);
          throw new Error(`Failed to fetch videos: ${response.status}`);
        }

        const contentType = response.headers.get("content-type");
        if (!contentType || !contentType.includes("application/json")) {
          const text = await response.text();
          console.error("[VideoFetch] Invalid content-type:", contentType, text.substring(0, 100));
          throw new Error("Received non-JSON response from server");
        }

        const data = await response.json();

        if (data.success) {
          // Convert uploadedAt strings to Date objects
          const videosWithDates = data.videos.map((video: any) => ({
            ...video,
            fileSize: video.size || video.fileSize || 0, // ✅ Fix: Map 'size' from DB to 'fileSize' for UI
            uploadedAt: video.uploadedAt ? new Date(video.uploadedAt) : new Date()
          }));
          setVideos(videosWithDates);
        } else {
          console.error("[VideoFetch] API returned detailed error:", data);
          throw new Error(data.error || 'Failed to fetch videos');
        }
      } catch (error) {
        console.error('Error fetching videos:', error);
        toast({
          title: "Failed to load videos",
          description: "Could not fetch your videos. Please try again.",
          variant: "destructive",
        });
        setVideos([]);
      } finally {
        setLoading(false);
      }
    };

    fetchVideos();
  }, [toast]);



  const filteredVideos = videos.filter(video => {
    const matchesSearch = video.filename.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = filterStatus === "all" || video.status === filterStatus;
    return matchesSearch && matchesStatus;
  });

  const handleEditVideo = (video: VideoItem) => {
    setSelectedVideo(video);
    setShowEditor(true);
    if (onEditVideo) {
      onEditVideo(video.videoUuid);
    }
  };

  const handleDeleteVideo = async (videoUuid: string) => {
    if (window.confirm('Are you sure you want to delete this video? This action cannot be undone.')) {
      try {
        setDeletingVideo(videoUuid);

        const response = await fetch('/api/services/uploaderx/videos', {
          method: 'DELETE',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ videoUuid }),
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Failed to delete video');
        }

        // Remove from local state
        setVideos(prev => prev.filter(v => v.videoUuid !== videoUuid));

        toast({
          title: "Video deleted",
          description: "The video has been successfully deleted.",
        });

        if (onDeleteVideo) {
          onDeleteVideo(videoUuid);
        }
      } catch (error) {
        console.error('Error deleting video:', error);
        toast({
          title: "Delete failed",
          description: error instanceof Error ? error.message : "Failed to delete the video. Please try again.",
          variant: "destructive",
        });
      } finally {
        setDeletingVideo(null);
      }
    }
  };

  const handleDownloadVideo = (videoUrl: string, filename: string) => {
    const link = document.createElement('a');
    link.href = videoUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const refreshVideos = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/services/uploaderx/videos');

      if (!response.ok) {
        throw new Error('Failed to fetch videos');
      }

      const data = await response.json();

      if (data.success) {
        // Convert uploadedAt strings to Date objects
        const videosWithDates = data.videos.map((video: any) => ({
          ...video,
          fileSize: video.size || video.fileSize || 0,
          uploadedAt: video.uploadedAt ? new Date(video.uploadedAt) : new Date()
        }));
        setVideos(videosWithDates);
        toast({
          title: "Videos refreshed",
          description: "Your video list has been updated.",
        });
      } else {
        throw new Error(data.error || 'Failed to fetch videos');
      }
    } catch (error) {
      console.error('Error refreshing videos:', error);
      toast({
        title: "Refresh failed",
        description: "Could not refresh your videos. Please try again.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'ready': return 'bg-green-500';
      case 'processing': return 'bg-yellow-500';
      case 'uploaded': return 'bg-blue-500';
      case 'error': return 'bg-red-500';
      default: return 'bg-zinc-500';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'ready': return 'Ready';
      case 'processing': return 'Processing';
      case 'uploaded': return 'Uploaded';
      case 'error': return 'Error';
      default: return 'Unknown';
    }
  };

  const formatFileSize = (bytes: number) => {
    const mb = bytes / (1024 * 1024);
    return `${mb.toFixed(1)} MB`;
  };
  // ================== 📺 Upload to YouTube ===================
  // ================== 📺 Upload to YouTube ===================
  const formatDuration = (seconds: number) => {
    const safeSeconds = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0;
    const minutes = Math.floor(safeSeconds / 60);
    const remainingSeconds = safeSeconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, "0")}`;
  };

  const handleYouTubeUpload = async (video: VideoItem) => {
    try {
      // Direct call to backend - Clerk handles the token
      toast({
        title: "Uploading to YouTube...",
        description: `Sending ${video.filename} to your YouTube channel.`,
      });

      const res = await fetch("/api/services/uploaderx/youtube", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          gcsPath: video.gcsPath,
          filename: video.filename,
          videoUuid: video.videoUuid,
        }),
      });

      const data = await res.json();
      if (!data.success && res.status === 403) {
        throw new Error("Please sign in with Google again to grant YouTube permissions.");
      }

      if (data.success) {
        toast({
          title: "✅ Uploaded to YouTube",
          description: `Your video is live on YouTube!`,
        });

        setUploadedVideoLink(data.youtubeUrl);
        setUploadPlatform("YouTube");
        setShowUploadDialog(true);

      } else {
        throw new Error(data.error || "Failed to upload to YouTube");
      }
    } catch (err) {
      console.error("❌ YouTube upload error:", err);
      toast({
        title: "Upload failed",
        description: err instanceof Error ? err.message : "YouTube upload failed",
        variant: "destructive",
      });
    }
  };

  // ================== 🔵 Upload to Facebook ===================
  const handleFacebookUpload = async (video: VideoItem) => {
    try {
      // 1. Check Facebook connection status first
      const statusRes = await fetch('/api/services/uploaderx/facebook/pages');
      const statusData = await statusRes.json();

      if (!statusData.connected) {
        toast({
          title: "Facebook Not Connected",
          description: "Please connect your Facebook account to upload videos.",
        });
        // Open Facebook OAuth in new tab
        window.open('/api/services/uploaderx/facebook/auth', '_blank');
        return;
      }

      // 2. Check if user has any pages
      if (!statusData.pages || statusData.pages.length === 0) {
        toast({
          title: "No Facebook Pages",
          description: "You need at least one Facebook Page to upload videos. Create one at facebook.com/pages/create, then reconnect Facebook.",
          variant: "destructive",
        });
        
        // Clear old tokens and reconnect
        try {
          await fetch('/api/services/uploaderx/facebook/reset', { method: 'POST' });
        } catch (e) {
          console.warn("Failed to clear old tokens:", e);
        }
        
        // Open Facebook OAuth in new tab
        window.open('/api/services/uploaderx/facebook/auth', '_blank');
        return;
      }

      // 3. Show page selection if multiple pages
      let selectedPageId = null;
      if (statusData.pages.length > 1) {
        const pageNames = statusData.pages.map((p: any) => p.pageName).join('\n');
        const input = prompt(`Select a Facebook Page:\n${pageNames}`);
        if (!input) return; // User cancelled
        const selectedPage = statusData.pages.find((p: any) => p.pageName === input);
        if (!selectedPage) {
          toast({
            title: "Invalid Page",
            description: "Please select a valid page name.",
            variant: "destructive",
          });
          return;
        }
        selectedPageId = selectedPage.pageId;
      }

      // 4. Upload to Facebook
      toast({
        title: "Uploading to Facebook...",
        description: `Sending ${video.filename} to ${statusData.pages[0]?.pageName || 'your Facebook Page'}.`,
      });

      const res = await fetch("/api/services/uploaderx/facebook", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          gcsPath: video.gcsPath,
          videoUuid: video.videoUuid,
          pageId: selectedPageId,
        }),
      });

      const data = await res.json();

      if (!data.success && res.status === 403) {
        throw new Error("Please connect your Facebook account first.");
      }

      if (data.success) {
        toast({
          title: "✅ Uploaded to Facebook",
          description: `Video posted to ${data.pageName || 'your Page'}!`,
        });

        setUploadedVideoLink(data.facebookUrl);
        setUploadPlatform("Facebook");
        setShowUploadDialog(true);
      } else {
        throw new Error(data.error || "Failed to upload to Facebook");
      }
    } catch (err) {
      console.error("❌ Facebook upload error:", err);
      toast({
        title: "Upload failed",
        description: err instanceof Error ? err.message : "Facebook upload failed",
        variant: "destructive",
      });
    }
  };

  // ================== 🟣 Upload to Instagram ===================
  const handleInstagramUpload = async (video: VideoItem) => {
    try {
      // 1. Check Instagram connection status first
      const statusRes = await fetch('/api/services/uploaderx/instagram/status');
      const statusData = await statusRes.json();

      if (!statusData.connected) {
        toast({
          title: "Instagram Not Connected",
          description: "Please connect your Instagram account to upload videos.",
        });
        // Open Instagram OAuth in new tab
        window.open('/api/services/uploaderx/instagram/auth', '_blank');
        return;
      }

      // 2. Check if user has any Instagram accounts
      if (!statusData.accounts || statusData.accounts.length === 0) {
        toast({
          title: "No Instagram Accounts",
          description: "You don't have any Instagram accounts connected. Please reconnect Instagram.",
          variant: "destructive",
        });

        // Clear old tokens and reconnect
        try {
          await fetch('/api/services/uploaderx/instagram/accounts', { method: 'DELETE' });
        } catch (e) {
          console.warn("Failed to clear old tokens:", e);
        }

        // Open Instagram OAuth in new tab
        window.open('/api/services/uploaderx/instagram/auth', '_blank');
        return;
      }

      // 3. Show account selection if multiple accounts
      let selectedAccountId = null;
      if (statusData.accounts.length > 1) {
        const accountNames = statusData.accounts.map((a: any) => `@${a.instagramUsername}`).join('\n');
        const input = prompt(`Select an Instagram Account:\n${accountNames}`);
        if (!input) return; // User cancelled
        const selectedAccount = statusData.accounts.find((a: any) => `@${a.instagramUsername}` === input || a.instagramUsername === input);
        if (!selectedAccount) {
          toast({
            title: "Invalid Account",
            description: "Please select a valid account name.",
            variant: "destructive",
          });
          return;
        }
        selectedAccountId = selectedAccount.instagramAccountId;
      }

      // 4. Upload to Instagram
      toast({
        title: "Uploading to Instagram...",
        description: `Publishing ${video.filename} as Reel to ${statusData.accounts[0]?.instagramUsername || 'your Instagram account'}.`,
      });

      const res = await fetch("/api/services/uploaderx/instagram", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          gcsPath: video.gcsPath,
          videoUuid: video.videoUuid,
          accountId: selectedAccountId,
        }),
      });

      const data = await res.json();

      if (!data.success && res.status === 403) {
        throw new Error("Please connect your Instagram account first.");
      }

      if (data.success) {
        toast({
          title: "✅ Uploaded to Instagram",
          description: `Reel published to ${data.accountUsername || 'your account'}!`,
        });

        setUploadedVideoLink(data.instagramUrl);
        setUploadPlatform("Instagram");
        setShowUploadDialog(true);
      } else {
        throw new Error(data.error || "Failed to upload to Instagram");
      }
    } catch (err) {
      console.error("❌ Instagram upload error:", err);
      toast({
        title: "Upload failed",
        description: err instanceof Error ? err.message : "Instagram upload failed",
        variant: "destructive",
      });
    }
  };

  // ================== 🐦 Upload to Twitter ===================
  const handleTwitterUpload = async (video: VideoItem) => {
    try {
      // 1. Check Twitter connection status first
      const statusRes = await fetch('/api/services/uploaderx/twitter/status');
      const statusData = await statusRes.json();

      if (!statusData.connected) {
        toast({
          title: "Twitter Not Connected",
          description: "Please connect your Twitter account to upload videos.",
        });
        // Redirect to Twitter OAuth in the same tab
        window.location.href = '/api/services/uploaderx/twitter/auth';
        return;
      }

      // 2. Check if token is expired (status endpoint should have refreshed it)
      if (statusData.isExpired) {
        toast({
          title: "Twitter Token Expired",
          description: "Please reconnect your Twitter account.",
          variant: "destructive",
        });
        window.location.href = '/api/services/uploaderx/twitter/auth';
        return;
      }

      // 3. Check if required permissions are granted
      if (statusData.missingScopes && statusData.missingScopes.includes("tweet.write")) {
        toast({
          title: "Missing Twitter Permission",
          description: "The 'tweet.write' permission is required. Please reconnect your Twitter account.",
          variant: "destructive",
        });
        window.location.href = '/api/services/uploaderx/twitter/auth';
        return;
      }

      // 4. Upload to Twitter
      toast({
        title: "Uploading to Twitter...",
        description: `Posting ${video.filename} to your Twitter account.`,
      });

      // Get description from video metadata if available
      const description = video.metadata?.description || "";

      const res = await fetch("/api/services/uploaderx/twitter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          gcsPath: video.gcsPath,
          videoUuid: video.videoUuid,
          title: video.filename,
          description: description,
        }),
      });

      const data = await res.json();

      if (!data.success && res.status === 403) {
        throw new Error("Please connect your Twitter account first.");
      }

      if (data.success) {
        toast({
          title: "✅ Posted to Twitter",
          description: `Tweet posted to ${data.accountUsername || 'your account'}!`,
        });

        setUploadedVideoLink(data.tweetUrl);
        setUploadPlatform("Twitter");
        setShowUploadDialog(true);
      } else {
        throw new Error(data.error || "Failed to upload to Twitter");
      }
    } catch (err) {
      console.error("❌ Twitter upload error:", err);
      toast({
        title: "Upload failed",
        description: err instanceof Error ? err.message : "Twitter upload failed",
        variant: "destructive",
      });
    }
  };

  // ================== 🔗 Upload to LinkedIn ===================
  const handleLinkedInUpload = async (video: VideoItem) => {
    try {
      // 1. Check LinkedIn connection status first
      const statusRes = await fetch('/api/services/uploaderx/linkedin/status');
      const statusData = await statusRes.json();

      if (!statusData.connected) {
        toast({
          title: "LinkedIn Not Connected",
          description: "Please connect your LinkedIn account to upload content.",
        });
        // Open LinkedIn OAuth in same tab
        window.location.href = '/api/services/uploaderx/linkedin/auth';
        return;
      }

      // 2. Check if token is expired
      if (statusData.isExpired) {
        toast({
          title: "LinkedIn Token Expired",
          description: "Please reconnect your LinkedIn account.",
          variant: "destructive",
        });
        window.location.href = '/api/services/uploaderx/linkedin/auth';
        return;
      }

      // 3. Determine post type and organization selection
      let postType: 'personal' | 'organization' = 'personal';
      let selectedOrganizationId: string | null = null;

      const targets: Array<{ type: 'personal' | 'organization'; label: string; organizationId?: string }> = [];
      if (statusData.canPostPersonal) {
        targets.push({ type: 'personal', label: 'Personal Profile' });
      }

      if (statusData.organizations && statusData.organizations.length > 0) {
        statusData.organizations.forEach((org: any) => {
          targets.push({ type: 'organization', label: org.name, organizationId: org.id });
        });
      }

      if (targets.length === 0) {
        toast({
          title: "LinkedIn posting unavailable",
          description: "Your LinkedIn connection does not include a valid posting target. Reconnect with the proper LinkedIn scopes.",
          variant: "destructive",
        });
        return;
      }

      let selectedTargetIndex = 0;
      if (targets.length > 1) {
        const selectionPrompt = targets
          .map((target, index) => `${index + 1}. ${target.label}`)
          .join('\n');

        const input = prompt(`Select where to post:\n${selectionPrompt}`);
        if (!input) return; // User cancelled

        selectedTargetIndex = parseInt(input, 10) - 1;
        if (selectedTargetIndex < 0 || selectedTargetIndex >= targets.length) {
          toast({
            title: "Invalid Selection",
            description: "Please select a valid option.",
            variant: "destructive",
          });
          return;
        }
      }

      const selectedTarget = targets[selectedTargetIndex];
      postType = selectedTarget.type;
      selectedOrganizationId = selectedTarget.organizationId || null;

      // 4. Upload to LinkedIn
      const postTarget = postType === 'organization'
        ? statusData.organizations?.find((o: any) => o.id === selectedOrganizationId)?.name || 'organization'
        : 'your profile';

      toast({
        title: "Uploading to LinkedIn...",
        description: `Posting to ${postTarget}.`,
      });

      const res = await fetch("/api/services/uploaderx/linkedin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          gcsPath: video.gcsPath,
          videoUuid: video.videoUuid,
          title: video.metadata?.title || video.filename,
          description: video.metadata?.description || "",
          postType,
          organizationId: selectedOrganizationId,
        }),
      });

      const data = await res.json();

      if (!data.success && res.status === 403) {
        throw new Error("Please connect your LinkedIn account first.");
      }

      if (data.success) {
        toast({
          title: "✅ Posted to LinkedIn",
          description: `Content posted to ${postTarget}!`,
        });

        setUploadedVideoLink(data.postUrl);
        setUploadPlatform("LinkedIn");
        setShowUploadDialog(true);
      } else {
        throw new Error(data.error || "Failed to upload to LinkedIn");
      }
    } catch (err) {
      console.error("❌ LinkedIn upload error:", err);
      toast({
        title: "Upload failed",
        description: err instanceof Error ? err.message : "LinkedIn upload failed",
        variant: "destructive",
      });
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-400"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-zinc-200">My Videos</h2>
          <p className="text-zinc-400">Manage and edit your uploaded videos</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            onClick={refreshVideos}
            variant="outline"
            disabled={loading}
            className="border-zinc-800 text-zinc-200 hover:bg-zinc-800"
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Button onClick={onUploadNew} className="bg-emerald-600 hover:bg-emerald-500">
            <Upload className="h-4 w-4 mr-2" />
            Upload New Video
          </Button>
        </div>
      </div>

      {/* Search and Filters */}
      <div className="flex items-center gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-zinc-400" />
          <Input
            placeholder="Search videos..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>

        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="p-2 bg-zinc-900 border border-zinc-800 rounded-md text-zinc-200"
        >
          <option value="all">All Status</option>
          <option value="ready">Ready</option>
          <option value="processing">Processing</option>
          <option value="uploaded">Uploaded</option>
          <option value="error">Error</option>
        </select>

        <div className="flex items-center gap-2">
          <Button
            variant={viewMode === "grid" ? "default" : "outline"}
            size="sm"
            onClick={() => setViewMode("grid")}
          >
            <Grid className="h-4 w-4" />
          </Button>
          <Button
            variant={viewMode === "list" ? "default" : "outline"}
            size="sm"
            onClick={() => setViewMode("list")}
          >
            <List className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Videos Grid/List */}
      {filteredVideos.length === 0 ? (
        <Card className="bg-zinc-950/60 border-zinc-800">
          <CardContent className="p-12 text-center">
            <Video className="h-12 w-12 text-zinc-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-zinc-200 mb-2">No videos found</h3>
            <p className="text-zinc-400 mb-4">
              {searchTerm ? "Try adjusting your search terms" : "Upload your first video to get started"}
            </p>
            {!searchTerm && (
              <Button onClick={onUploadNew} className="bg-emerald-600 hover:bg-emerald-500">
                <Upload className="h-4 w-4 mr-2" />
                Upload Video
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className={viewMode === "grid" ? "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6" : "space-y-4"}>
          {filteredVideos.map((video) => (
            <Card key={video.videoUuid} className="bg-zinc-950/60 border-zinc-800">
              <CardContent className="p-0">
                {viewMode === "grid" ? (
                  // Grid View
                  <div>
                    <div className="relative">
                      <VideoPlayer
                        videoUrl={video.publicUrl}
                        videoUuid={video.videoUuid}
                        filename={video.filename}
                        fileSize={video.fileSize}
                        uploadedAt={video.uploadedAt}
                        onEdit={() => handleEditVideo(video)}
                        onDelete={() => handleDeleteVideo(video.videoUuid)}
                        onDownload={(url, filename) => handleDownloadVideo(url, filename)}
                        isDeleting={deletingVideo === video.videoUuid}
                      />
                    </div>
                    <div className="p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <h3 className="font-medium text-zinc-200 truncate">{video.filename}</h3>
                        <Badge className={`${getStatusColor(video.status)} text-white`}>
                          {getStatusText(video.status)}
                        </Badge>
                      </div>

                      <div className="flex items-center gap-4 text-sm text-zinc-400">
                        <span>{formatFileSize(video.fileSize)}</span>
                        {video.metadata?.duration && (
                          <span>{formatDuration(video.metadata.duration)}</span>
                        )}
                        <span>{video.uploadedAt ? video.uploadedAt.toLocaleDateString() : 'Unknown date'}</span>
                      </div>

                      {video.platforms && video.platforms.length > 0 && (
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-zinc-400">Platforms:</span>
                          <div className="flex gap-1">
                            {video.platforms.map(platform => (
                              <Badge key={platform} variant="outline" className="text-[11px]">
                                {platform}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      )}

                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleEditVideo(video)}
                          className="flex-1"
                        >
                          <Edit className="h-4 w-4 mr-2" />
                          Edit
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleYouTubeUpload(video)}
                          title="Upload to YouTube"
                        >
                          <Youtube className="h-4 w-4 text-red-500" />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleInstagramUpload(video)}
                          title="Upload to Instagram"
                          disabled
                          className="opacity-50 cursor-not-allowed"
                        >
                          <Instagram className="h-4 w-4 text-pink-500" />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleFacebookUpload(video)}
                          title="Upload to Facebook"
                        >
                          <Facebook className="h-4 w-4 text-blue-500" />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleTwitterUpload(video)}
                          title="Upload to Twitter"
                        >
                          <Twitter className="h-4 w-4 text-sky-500" />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleDownloadVideo(video.publicUrl, video.filename)}
                        >
                          <Download className="h-4 w-4" />
                        </Button>

                      </div>
                    </div>
                  </div>
                ) : (
                  // List View
                  <div className="p-4">
                    <div className="flex items-center gap-4">
                      <div className="w-16 h-12 bg-zinc-800 rounded flex items-center justify-center">
                        <Video className="h-6 w-6 text-zinc-400" />
                      </div>

                      <div className="flex-1 min-w-0">
                        <h3 className="font-medium text-zinc-200 truncate">{video.filename}</h3>
                        <div className="flex items-center gap-4 text-sm text-zinc-400 mt-1">
                          <span>{formatFileSize(video.fileSize)}</span>
                          {video.metadata?.duration && (
                            <span>{formatDuration(video.metadata.duration)}</span>
                          )}
                          <span>{video.uploadedAt ? video.uploadedAt.toLocaleDateString() : 'Unknown date'}</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <Badge className={`${getStatusColor(video.status)} text-white`}>
                          {getStatusText(video.status)}
                        </Badge>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleEditVideo(video)}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleYouTubeUpload(video)}
                          title="Upload to YouTube"
                        >
                          <Youtube className="h-4 w-4 text-red-500" />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleInstagramUpload(video)}
                          title="Upload to Instagram"
                          disabled
                          className="opacity-50 cursor-not-allowed"
                        >
                          <Instagram className="h-4 w-4 text-pink-500" />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleFacebookUpload(video)}
                          title="Upload to Facebook"
                        >
                          <Facebook className="h-4 w-4 text-blue-500" />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleTwitterUpload(video)}
                          title="Upload to Twitter"
                        >
                          <Twitter className="h-4 w-4 text-sky-500" />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleLinkedInUpload(video)}
                          title="Upload to LinkedIn"
                        >
                          <Linkedin className="h-4 w-4 text-blue-600" />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleDownloadVideo(video.publicUrl, video.filename)}
                        >
                          <Download className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleDeleteVideo(video.videoUuid)}
                          disabled={deletingVideo === video.videoUuid}
                          className="text-red-400 hover:text-red-300"
                        >
                          <Trash2 className={`h-4 w-4 ${deletingVideo === video.videoUuid ? 'animate-pulse' : ''}`} />
                        </Button>
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Platform Editor Modal */}
      {showEditor && selectedVideo && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <Card className="bg-zinc-950 border-zinc-800 w-full max-w-4xl max-h-[90vh] overflow-y-auto">
            <CardHeader>
              <CardTitle className="text-zinc-200">Edit Video Settings</CardTitle>
            </CardHeader>
            <CardContent>
              <PlatformEditor
                platforms={[
                  { key: 'youtube', label: 'YouTube' },
                  { key: 'instagram', label: 'Instagram' },
                  { key: 'facebook', label: 'Facebook' },
                ]}
                videoUuid={selectedVideo.videoUuid}
                defaultTitle={selectedVideo.filename}
                initialData={selectedVideo.metadata as any} // Cast as any because metadata is generic locally but editor expects specific shape
                onSave={async (platformData) => {
                  try {
                    const response = await fetch(`/api/services/uploaderx/videos/${selectedVideo.videoUuid}`, {
                      method: 'PATCH',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ metadata: platformData }),
                    });

                    const responseData = await response.json();

                    if (!response.ok) {
                      console.error("Save failed response:", responseData);
                      throw new Error(responseData.error || 'Failed to save settings');
                    }

                    toast({
                      title: "Settings saved",
                      description: "Video metadata has been updated successfully.",
                    });

                    // Update local video state with new metadata
                    setVideos(prev => prev.map(v =>
                      v.videoUuid === selectedVideo.videoUuid
                        ? { ...v, metadata: { ...v.metadata, ...platformData } }
                        : v
                    ));

                    setShowEditor(false);
                  } catch (error) {
                    console.error("Save error details:", error);
                    toast({
                      title: "Save failed",
                      description: error instanceof Error ? error.message : "Could not save settings. Please try again.",
                      variant: "destructive",
                    });
                  }
                }}
              />
            </CardContent>
          </Card>
        </div>
      )}
      <Dialog open={showUploadDialog} onOpenChange={setShowUploadDialog}>
        <DialogContent className="bg-[#131312] border-[#1C1B19] rounded-md max-w-md p-0 text-center">
          <div className="px-6 pt-6 pb-4">
            <DialogHeader>
              <div className="mx-auto mb-3 w-10 h-10 rounded-full bg-[#5EC97E]/10 flex items-center justify-center">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#5EC97E" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
              </div>
              <DialogTitle className="text-[16px] font-semibold text-[#ECE9E1]">
                Video Uploaded
              </DialogTitle>
              <DialogDescription className="text-[12px] text-[#7A776E] mt-1">
                Your video is now live on {uploadPlatform}.
              </DialogDescription>
            </DialogHeader>

            <div className="mt-4 p-3 bg-[#1B1A18] border border-[#282724] rounded">
              <p className="text-[10px] font-mono tracking-[0.08em] uppercase text-[#5F5E5A] mb-1">{uploadPlatform} Link</p>
              <a
                href={uploadedVideoLink}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[#D4A652] text-[13px] font-medium hover:underline break-all"
              >
                {uploadedVideoLink}
              </a>
            </div>
          </div>

          <DialogFooter className="px-6 pb-5 flex justify-center">
            <Button
              className="bg-[#D4A652] hover:bg-[#C49840] text-[#0B0B0A] font-semibold rounded px-6"
              onClick={() => setShowUploadDialog(false)}
            >
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}


export default VideoManager;

