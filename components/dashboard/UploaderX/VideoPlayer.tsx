"use client";

import { useState, useRef, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Play, Pause, Volume2, VolumeX, Maximize, Download, Edit, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface VideoPlayerProps {
  videoUrl: string;
  videoUuid: string;
  filename: string;
  fileSize?: number;
  uploadedAt?: Date;
  onEdit?: (videoUuid: string) => void;
  onDelete?: (videoUuid: string) => void;
  onDownload?: (videoUrl: string, filename: string) => void;
  isDeleting?: boolean;
}

export function VideoPlayer({
  videoUrl,
  videoUuid,
  filename,
  fileSize,
  uploadedAt,
  onEdit,
  onDelete,
  onDownload,
  isDeleting = false
}: VideoPlayerProps) {
  if (!videoUrl || !videoUuid) {
    console.warn("⚠️ Missing video data in VideoPlayer:", { videoUrl, videoUuid });
   
  }
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [hasVideoError, setHasVideoError] = useState(false);
  const [isLoadingVideo, setIsLoadingVideo] = useState(true);
  const videoRef = useRef<HTMLVideoElement>(null);
  const { toast } = useToast();

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const updateTime = () => setCurrentTime(video.currentTime);
    const updateDuration = () => setDuration(video.duration);
    const handleEnded = () => setIsPlaying(false);
    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);
    const handleLoadStart = () => setIsLoadingVideo(true);
    const handleCanPlay = () => {
      setIsLoadingVideo(false);
      setHasVideoError(false);
    };
    const handleError = (e: Event) => {
      console.error('Video error:', e);
      setIsLoadingVideo(false);
      setHasVideoError(true);
      toast({
        title: "Video playback error",
        description: "Could not load the video. The file may be corrupted or in an unsupported format.",
        variant: "destructive",
      });
    };

    video.addEventListener('timeupdate', updateTime);
    video.addEventListener('loadedmetadata', updateDuration);
    video.addEventListener('ended', handleEnded);
    video.addEventListener('play', handlePlay);
    video.addEventListener('pause', handlePause);
    video.addEventListener('loadstart', handleLoadStart);
    video.addEventListener('canplay', handleCanPlay);
    video.addEventListener('error', handleError);

    return () => {
      video.removeEventListener('timeupdate', updateTime);
      video.removeEventListener('loadedmetadata', updateDuration);
      video.removeEventListener('ended', handleEnded);
      video.removeEventListener('play', handlePlay);
      video.removeEventListener('pause', handlePause);
      video.removeEventListener('loadstart', handleLoadStart);
      video.removeEventListener('canplay', handleCanPlay);
      video.removeEventListener('error', handleError);
    };
  }, []);

  const togglePlay = () => {
    const video = videoRef.current;
    if (!video) return;

    if (isPlaying) {
      video.pause();
      setIsPlaying(false);
    } else {
      video.play().catch(error => {
        console.error('Error playing video:', error);
        toast({
          title: "Playback error",
          description: "Could not play the video. Please check the video file.",
          variant: "destructive",
        });
      });
      setIsPlaying(true);
    }
  };

  const toggleMute = () => {
    const video = videoRef.current;
    if (!video) return;

    video.muted = !isMuted;
    setIsMuted(!isMuted);
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newVolume = parseFloat(e.target.value);
    const video = videoRef.current;
    if (!video) return;

    video.volume = newVolume;
    setVolume(newVolume);
    setIsMuted(newVolume === 0);
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const video = videoRef.current;
    if (!video) return;

    const newTime = parseFloat(e.target.value);
    video.currentTime = newTime;
    setCurrentTime(newTime);
  };

  const toggleFullscreen = () => {
    const video = videoRef.current;
    if (!video) return;

    if (!document.fullscreenElement) {
      video.requestFullscreen();
      setIsFullscreen(true);
    } else {
      document.exitFullscreen();
      setIsFullscreen(false);
    }
  };

  const handleDownload = () => {
    if (onDownload) {
      onDownload(videoUrl, filename);
    } else {
      // Default download behavior
      const link = document.createElement('a');
      link.href = videoUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  const retryVideo = () => {
    const video = videoRef.current;
    if (!video) return;
    
    setHasVideoError(false);
    setIsLoadingVideo(true);
    video.load(); // Reload the video
  };

  const formatTime = (time: number) => {
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  const formatFileSize = (bytes?: number) => {
    if (!bytes) return 'Unknown size';
    const mb = bytes / (1024 * 1024);
    return `${mb.toFixed(2)} MB`;
  };

  return (
    <Card className="bg-zinc-950/60 border-zinc-800 overflow-hidden">
      <CardContent className="p-0">
        {/* Video Container */}
        <div className="relative bg-black">
          <video
            ref={videoRef}
            src={videoUrl}
            className="w-full h-64 object-cover"
            poster=""
            preload="metadata"
          />
          
          {/* Loading Overlay */}
          {isLoadingVideo && !hasVideoError && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/50">
              <div className="flex flex-col items-center gap-2">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white"></div>
                <span className="text-white text-sm">Loading video...</span>
              </div>
            </div>
          )}

          {/* Error Overlay */}
          {hasVideoError && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/50">
              <div className="flex flex-col items-center gap-3 text-center p-4">
                <div className="text-red-400 text-[44px]">⚠️</div>
                <span className="text-white text-sm">Video cannot be played</span>
                <span className="text-gray-300 text-[11px]">File may be corrupted or unsupported</span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={retryVideo}
                  className="text-white border-white hover:bg-white hover:text-black"
                >
                  Retry
                </Button>
              </div>
            </div>
          )}
          
          {/* Play/Pause Overlay */}
          {!isLoadingVideo && !hasVideoError && (
            <div className="absolute inset-0 flex items-center justify-center">
              <Button
                variant="ghost"
                size="lg"
                className="bg-black/50 hover:bg-black/70 text-white rounded-full w-16 h-16"
                onClick={togglePlay}
              >
                {isPlaying ? (
                  <Pause className="h-8 w-8" />
                ) : (
                  <Play className="h-8 w-8 ml-1" />
                )}
              </Button>
            </div>
          )}

          {/* Video Info Overlay */}
          <div className="absolute top-2 left-2">
            <Badge variant="secondary" className="bg-black/50 text-white">
              {formatFileSize(fileSize)}
            </Badge>
          </div>

          {/* Action Buttons Overlay */}
          <div className="absolute top-2 right-2 flex gap-2">
            <Button
              variant="ghost"
              size="sm"
              className="bg-black/50 hover:bg-black/70 text-white"
              onClick={handleDownload}
            >
              <Download className="h-4 w-4" />
            </Button>
            {onEdit && (
              <Button
                variant="ghost"
                size="sm"
                className="bg-black/50 hover:bg-black/70 text-white"
                onClick={() => onEdit(videoUuid)}
              >
                <Edit className="h-4 w-4" />
              </Button>
            )}
            {onDelete && (
              <Button
                variant="ghost"
                size="sm"
                className="bg-black/50 hover:bg-black/70 text-red-400"
                onClick={() => onDelete(videoUuid)}
                disabled={isDeleting}
              >
                <Trash2 className={`h-4 w-4 ${isDeleting ? 'animate-pulse' : ''}`} />
              </Button>
            )}
          </div>
        </div>

        {/* Controls */}
        <div className="p-4 space-y-3">
          {/* Progress Bar */}
          <div className="space-y-2">
            <input
              type="range"
              min="0"
              max={duration || 0}
              value={currentTime}
              onChange={handleSeek}
              className="w-full h-1 bg-zinc-700 rounded-lg appearance-none cursor-pointer slider"
            />
            <div className="flex justify-between text-[11px] text-zinc-400">
              <span>{formatTime(currentTime)}</span>
              <span>{formatTime(duration)}</span>
            </div>
          </div>

          {/* Control Buttons */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={togglePlay}
                className="text-zinc-200 hover:text-white"
              >
                {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
              </Button>
              
              <Button
                variant="ghost"
                size="sm"
                onClick={toggleMute}
                className="text-zinc-200 hover:text-white"
              >
                {isMuted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
              </Button>
              
              <input
                type="range"
                min="0"
                max="1"
                step="0.1"
                value={volume}
                onChange={handleVolumeChange}
                className="w-20 h-1 bg-zinc-700 rounded-lg appearance-none cursor-pointer slider"
              />
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={toggleFullscreen}
                className="text-zinc-200 hover:text-white"
              >
                <Maximize className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Video Details */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="font-medium text-zinc-200 truncate">{filename}</h3>
              <Badge variant="outline" className="text-[11px]">
                {videoUuid.slice(0, 8)}...
              </Badge>
            </div>
            {uploadedAt && (
              <p className="text-[11px] text-zinc-400">
                Uploaded {uploadedAt ? uploadedAt.toLocaleDateString() : 'Unknown date'} at {uploadedAt ? uploadedAt.toLocaleTimeString() : 'Unknown time'}
              </p>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default VideoPlayer;

