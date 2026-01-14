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
  RefreshCw
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
        console.log("[VideoFetch] Data received:", data);

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

        // Show a helpful message for debugging
        console.log('Debug info:', {
          error: error instanceof Error ? error.message : String(error),
          timestamp: new Date().toISOString()
        });
      } finally {
        setLoading(false);
      }
    };

    fetchVideos();
    fetchVideos();
  }, [toast]);

  // 🔑 Capture YouTube Token from URL (OAuth Callback)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get("token");
    if (token) {
      localStorage.setItem("youtube_token", token);
      toast({
        title: "YouTube Connected",
        description: "Your account has been successfully linked.",
      });
      console.log("✅ YouTube token saved:", token);

      // Clean URL
      window.history.replaceState({}, document.title, window.location.pathname);
    }
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
  const handleYouTubeUpload = async (video: VideoItem) => {
    try {
      // 1. Get existing token or redirect to OAuth
      let accessToken = localStorage.getItem("youtube_token");
      if (!accessToken) {
        toast({
          title: "Connecting to YouTube...",
          description: "Please authorize YouTube access in a new tab.",
        });
        window.location.href = "/api/services/uploaderx/youtube/auth"; // redirect to OAuth
        return;
      }

      // 2. Send video details to backend route for YouTube upload
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
          accessToken,
        }),
      });

      const data = await res.json();
      if (data.success) {
        toast({
          title: "✅ Uploaded to YouTube",
          description: `Your video is live on YouTube!`,
        });

        console.log("🎬 YouTube Link:", data.youtubeUrl);
        // alert(`🎥 Video uploaded successfully!\n\nYouTube Link: ${data.youtubeUrl}`);
        setUploadedVideoLink(data.youtubeUrl);
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

  const formatDuration = (seconds: number) => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
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
                              <Badge key={platform} variant="outline" className="text-xs">
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
                onSave={(platformData) => {
                  console.log('Platform data saved:', platformData);
                  setShowEditor(false);
                }}
              />
            </CardContent>
          </Card>
        </div>
      )}
      <Dialog open={showUploadDialog} onOpenChange={setShowUploadDialog}>
        <DialogContent className="bg-zinc-950 border border-zinc-800 rounded-2xl shadow-2xl text-white max-w-md mx-auto text-center">
          <DialogHeader>
            <DialogTitle className="text-2xl font-semibold text-emerald-400">
              Video Uploaded Successfully!
            </DialogTitle>
            <DialogDescription className="text-zinc-400 mt-2">
              Your video is now live on YouTube.
            </DialogDescription>
          </DialogHeader>

          <div className="mt-4 p-3 bg-zinc-900/60 border border-zinc-800 rounded-lg">
            <p className="text-sm text-zinc-400 mb-1">YouTube Link:</p>
            <a
              href={uploadedVideoLink}
              target="_blank"
              rel="noopener noreferrer"
              className="text-emerald-400 font-medium hover:underline break-all"
            >
              {uploadedVideoLink}
            </a>
          </div>

          <DialogFooter className="mt-6 flex justify-center">
            <Button
              className="bg-emerald-600 hover:bg-emerald-500 text-white px-6"
              onClick={() => setShowUploadDialog(false)}
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}


export default VideoManager;

