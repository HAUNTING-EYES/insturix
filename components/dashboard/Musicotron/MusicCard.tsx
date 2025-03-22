"use client";

import type React from "react";

import { useState, useRef, useEffect, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import {
  Music2,
  Play,
  Pause,
  Volume2,
  VolumeX,
  Download,
  Share2,
  Heart,
  SkipBack,
  SkipForward,
  Repeat,
  Shuffle,
  Mic2,
  ListMusic,
  MoreHorizontal,
  ChevronDown,
  ChevronUp,
  ExternalLink,
} from "lucide-react";
import Image from "next/image";
import { cn } from "@/lib/utils";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "@/hooks/use-toast";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

interface GeneratedMusic {
  id: string;
  audio_url: string;
  source_audio_url: string;
  stream_audio_url: string;
  source_stream_audio_url: string;
  image_url: string;
  source_image_url: string;
  prompt: string;
  model_name: string;
  title: string;
  tags: string;
  createTime: string;
  duration: number;
}

interface MusicCardProps {
  music: GeneratedMusic;
}

export default function MusicCard({ music }: MusicCardProps) {
  // Core audio state
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [volume, setVolume] = useState(0.8);
  const [isDownloading, setIsDownloading] = useState(false);
  const [hoverPosition, setHoverPosition] = useState<number | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);

  // Enhanced features state
  const [isLiked, setIsLiked] = useState(false);
  const [isRepeat, setIsRepeat] = useState(false);
  const [isShuffle, setIsShuffle] = useState(false);
  const [showLyrics, setShowLyrics] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [equalizerSettings, setEqualizerSettings] = useState({
    bass: 0,
    mid: 0,
    treble: 0,
    preamp: 0,
  });
  const [playbackRate, setPlaybackRate] = useState(1);
  const [audioQuality, setAudioQuality] = useState("high");
  const [showWaveform, setShowWaveform] = useState(true);
  const [vinylRotation, setVinylRotation] = useState(0);
  const [waveformData, setWaveformData] = useState<number[]>([]);

  // Refs
  const audioRef = useRef<HTMLAudioElement>(null);
  const progressRef = useRef<HTMLDivElement>(null);
  const needleRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  // URLs
  const audioUrl =
    music.source_stream_audio_url ||
    music.stream_audio_url ||
    music.source_audio_url ||
    music.audio_url ||
    null;
  const imageUrl = music.source_image_url || music.image_url;

  // Derived data
  const progressPercent = (currentTime / music.duration) * 100;
  const tagsArray = useMemo(
    () => music.tags?.split(",").map((tag) => tag.trim()) || ["Music"],
    [music.tags]
  );

  // Mock lyrics for demo purposes
  const mockLyrics = useMemo(
    () => [
      { time: 0, text: "♪ Instrumental intro ♪" },
      { time: 15, text: "When the night falls down" },
      { time: 22, text: "And the stars come out" },
      { time: 30, text: "I can hear your voice" },
      { time: 38, text: "Calling out my name" },
      { time: 45, text: "Through the distant sound" },
      { time: 52, text: "Of the pouring rain" },
      { time: 60, text: "I'll be there for you" },
      { time: 68, text: "Time and time again" },
    ],
    []
  );

  const currentLyric = useMemo(() => {
    const found = mockLyrics
      .slice()
      .reverse()
      .find((lyric) => currentTime >= lyric.time);
    return found?.text || "♪ Instrumental ♪";
  }, [mockLyrics, currentTime]);

  // Initialize audio context and analyzer
  useEffect(() => {
    if (!audioContextRef.current && window.AudioContext) {
      audioContextRef.current = new AudioContext();
      analyserRef.current = audioContextRef.current.createAnalyser();
      analyserRef.current.fftSize = 256;
    }

    return () => {
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
    };
  }, []);

  // Connect audio element to analyzer
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !audioContextRef.current || !analyserRef.current) return;

    const source = audioContextRef.current.createMediaElementSource(audio);
    source.connect(analyserRef.current);
    analyserRef.current.connect(audioContextRef.current.destination);

    return () => {
      source.disconnect();
    };
  }, []);

  // Handle audio events
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const updateTime = () => setCurrentTime(audio.currentTime);
    const handleEnded = () => {
      if (isRepeat) {
        audio.currentTime = 0;
        audio.play();
      } else {
        setIsPlaying(false);
      }
    };

    audio.addEventListener("timeupdate", updateTime);
    audio.addEventListener("ended", handleEnded);

    return () => {
      audio.removeEventListener("timeupdate", updateTime);
      audio.removeEventListener("ended", handleEnded);
    };
  }, [isRepeat]);

  // Apply volume changes
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = volume;
      audioRef.current.playbackRate = playbackRate;
    }
  }, [volume, playbackRate]);

  // Vinyl rotation animation
  useEffect(() => {
    let animationId: number;

    const rotateVinyl = () => {
      if (isPlaying) {
        setVinylRotation((prev) => (prev + 0.2) % 360);
      }
      animationId = requestAnimationFrame(rotateVinyl);
    };

    if (isPlaying) {
      animationId = requestAnimationFrame(rotateVinyl);
    }

    return () => {
      cancelAnimationFrame(animationId);
    };
  }, [isPlaying]);

  // Draw waveform visualization
  useEffect(() => {
    if (
      !analyserRef.current ||
      !canvasRef.current ||
      !showWaveform ||
      !isPlaying
    )
      return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const analyser = analyserRef.current;
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    const draw = () => {
      if (!isPlaying) return;

      requestAnimationFrame(draw);
      analyser.getByteFrequencyData(dataArray);

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const barWidth = (canvas.width / bufferLength) * 2.5;
      let x = 0;

      for (let i = 0; i < bufferLength; i++) {
        const barHeight = (dataArray[i] / 255) * canvas.height * 0.8;

        // Gradient from green to white
        const gradient = ctx.createLinearGradient(
          0,
          canvas.height - barHeight,
          0,
          canvas.height
        );
        gradient.addColorStop(0, "rgba(30, 215, 96, 0.8)");
        gradient.addColorStop(1, "rgba(30, 215, 96, 0.2)");

        ctx.fillStyle = gradient;
        ctx.fillRect(x, canvas.height - barHeight, barWidth, barHeight);

        x += barWidth + 1;
      }
    };

    draw();
  }, [isPlaying, showWaveform]);

  // Generate random waveform data for initial display
  useEffect(() => {
    const generateRandomWaveform = () => {
      const data = [];
      for (let i = 0; i < 100; i++) {
        // Create a more musical pattern with some peaks and valleys
        const base = Math.sin(i / 10) * 0.5 + 0.5;
        const random = Math.random() * 0.3;
        data.push(base + random);
      }
      setWaveformData(data);
    };

    generateRandomWaveform();
  }, []);

  // Handle fullscreen mode
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };

    document.addEventListener("fullscreenchange", handleFullscreenChange);

    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
    };
  }, []);

  // Audio control functions
  const togglePlay = () => {
    if (!audioRef.current) return;

    if (isPlaying) {
      audioRef.current.pause();
    } else {
      // Resume AudioContext if it was suspended (browser policy)
      if (audioContextRef.current?.state === "suspended") {
        audioContextRef.current.resume();
      }

      audioRef.current.play().catch((error) => {
        console.error("Error playing audio:", error);
        toast({
          title: "Playback Error",
          description: "Could not play the audio. Please try again.",
          variant: "destructive",
        });
      });
    }
    setIsPlaying(!isPlaying);
  };

  const toggleMute = () => {
    if (!audioRef.current) return;

    audioRef.current.muted = !isMuted;
    setIsMuted(!isMuted);
  };

  const handleProgressClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!audioRef.current || !progressRef.current) return;

    const rect = progressRef.current.getBoundingClientRect();
    const percent = (e.clientX - rect.left) / rect.width;
    const newTime = percent * music.duration;

    audioRef.current.currentTime = newTime;
    setCurrentTime(newTime);
  };

  const handleProgressHover = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!progressRef.current) return;

    const rect = progressRef.current.getBoundingClientRect();
    const percent = (e.clientX - rect.left) / rect.width;
    setHoverPosition(percent * 100);
  };

  const handleProgressLeave = () => {
    setHoverPosition(null);
  };

  const formatTime = (time: number) => {
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds.toString().padStart(2, "0")}`;
  };

  const handleDownload = async () => {
    if (!audioUrl) {
      toast({
        title: "Download Error",
        description: "No audio URL available for download",
        variant: "destructive",
      });
      return;
    }

    setIsDownloading(true);

    try {
      const response = await fetch(audioUrl);

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const blob = await response.blob();
      const fileName = `${music.title || "audio"}.mp3`;

      // Create download link
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = fileName;
      link.style.display = "none";

      // Trigger download
      document.body.appendChild(link);
      link.click();

      // Cleanup
      setTimeout(() => {
        document.body.removeChild(link);
        window.URL.revokeObjectURL(url);
      }, 100);

      toast({
        title: "Download Complete",
        description: `${fileName} has been downloaded successfully.`,
      });
    } catch (error) {
      console.error("Download error:", error);
      toast({
        title: "Download Failed",
        description:
          "There was an error downloading the file. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsDownloading(false);
    }
  };

  const handleVolumeChange = (value: number[]) => {
    const newVolume = value[0];
    setVolume(newVolume);

    if (newVolume === 0 && !isMuted) {
      setIsMuted(true);
    } else if (newVolume > 0 && isMuted) {
      setIsMuted(false);
    }

    if (audioRef.current) {
      audioRef.current.volume = newVolume;
      audioRef.current.muted = newVolume === 0;
    }
  };

  const handlePlaybackRateChange = (value: number[]) => {
    const newRate = value[0];
    setPlaybackRate(newRate);

    if (audioRef.current) {
      audioRef.current.playbackRate = newRate;
    }
  };

  const handleEqualizerChange = (
    setting: keyof typeof equalizerSettings,
    value: number[]
  ) => {
    setEqualizerSettings((prev) => ({
      ...prev,
      [setting]: value[0],
    }));

    // In a real implementation, we would apply these settings to an actual equalizer
    // using the Web Audio API's BiquadFilterNode
  };

  const toggleFullscreen = () => {
    if (isFullscreen) {
      document.exitFullscreen();
    } else if (cardRef.current) {
      cardRef.current.requestFullscreen();
    }
  };

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: music.title || "Check out this track",
          text: `Listen to ${music.title || "this amazing track"}`,
          url: window.location.href,
        });
      } catch (error) {
        console.error("Error sharing:", error);
      }
    } else {
      // Fallback for browsers that don't support the Web Share API
      navigator.clipboard.writeText(window.location.href);
      toast({
        title: "Link Copied",
        description: "Share link copied to clipboard",
      });
    }
  };

  return (
    <TooltipProvider>
      <Card
        className={cn(
          "group overflow-hidden transition-all duration-500",
          isExpanded ? "max-w-4xl" : "max-w-sm",
          isFullscreen
            ? "fixed inset-0 z-50 max-w-none rounded-none"
            : "relative",
          "bg-gradient-to-br from-zinc-900 to-black border-zinc-800 hover:border-zinc-700"
        )}
      >
        <CardContent className="p-0">
          <div className="relative">
            {/* Expanded view toggle */}
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setIsExpanded(!isExpanded)}
              className="absolute top-2 right-2 z-10 h-8 w-8 rounded-full bg-black/60 backdrop-blur-md border border-white/10 opacity-0 group-hover:opacity-100 transition-opacity"
              aria-label={isExpanded ? "Collapse view" : "Expand view"}
            >
              {isExpanded ? (
                <ChevronUp className="h-4 w-4 text-zinc-300" />
              ) : (
                <ChevronDown className="h-4 w-4 text-zinc-300" />
              )}
            </Button>

            <div
              className={cn(
                "flex transition-all duration-500",
                isExpanded ? "flex-row" : "flex-col"
              )}
            >
              {/* Album art section */}
              <div
                className={cn(
                  "relative overflow-hidden",
                  isExpanded ? "w-1/2" : "w-full aspect-square"
                )}
              >
                {/* Background image with blur effect */}
                <div className="absolute inset-0 scale-110 opacity-30 blur-xl">
                  <Image
                    src={imageUrl || "/placeholder.svg?height=400&width=400"}
                    alt=""
                    fill
                    className="object-cover"
                  />
                </div>

                {/* Main album art */}
                <div
                  className={cn(
                    "relative z-10 mx-auto aspect-square transition-all duration-700",
                    isExpanded ? "w-3/4 mt-8" : "w-full",
                    isPlaying ? "scale-[0.95]" : "scale-100"
                  )}
                >
                  {/* Vinyl record effect */}
                  <div
                    className={cn(
                      "absolute inset-0 rounded-full bg-black/90 transition-all duration-700",
                      isPlaying
                        ? "opacity-100 scale-[0.98]"
                        : "opacity-0 scale-90"
                    )}
                    style={{
                      transform: `scale(0.98) rotate(${vinylRotation}deg)`,
                      transformOrigin: "center center",
                    }}
                  >
                    {/* Vinyl grooves */}
                    <div className="absolute inset-2 rounded-full border border-zinc-800"></div>
                    <div className="absolute inset-8 rounded-full border border-zinc-800"></div>
                    <div className="absolute inset-14 rounded-full border border-zinc-800"></div>
                    <div className="absolute inset-20 rounded-full border border-zinc-800"></div>
                    <div className="absolute inset-24 rounded-full border border-zinc-800"></div>

                    {/* Center hole */}
                    <div className="absolute inset-0 m-auto w-6 h-6 rounded-full bg-zinc-900 border-2 border-zinc-800"></div>

                    {/* Label */}
                    <div className="absolute inset-0 m-auto w-24 h-24 rounded-full bg-gradient-to-br from-green-500 to-green-600 flex items-center justify-center">
                      <Music2 className="h-8 w-8 text-white" />
                    </div>
                  </div>

                  <Image
                    src={imageUrl || "/placeholder.svg?height=400&width=400"}
                    alt={music.title || "Music cover"}
                    fill
                    className={cn(
                      "object-cover rounded-md transition-all duration-700",
                      isPlaying ? "rounded-full animate-spin" : "rounded-md"
                    )}
                    style={{
                      boxShadow:
                        "0 20px 25px -5px rgba(0, 0, 0, 0.5), 0 10px 10px -5px rgba(0, 0, 0, 0.2)",
                    }}
                  />
                </div>

                {/* Overlay gradient */}
                <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-transparent opacity-70 group-hover:opacity-80 transition-opacity duration-500" />

                {/* Play button overlay */}
                <button
                  onClick={togglePlay}
                  className="absolute inset-0 flex items-center justify-center"
                  aria-label={isPlaying ? "Pause" : "Play"}
                >
                  <div
                    className={cn(
                      "flex items-center justify-center rounded-full backdrop-blur-md border transition-all duration-500",
                      isPlaying
                        ? "w-14 h-14 bg-white/10 border-white/20 scale-90"
                        : "w-20 h-20 bg-green-500/90 border-green-400 scale-100",
                      "group-hover:scale-110"
                    )}
                  >
                    {isPlaying ? (
                      <Pause className="w-7 h-7 text-white" />
                    ) : (
                      <Play className="w-7 h-7 text-white translate-x-0.5" />
                    )}
                  </div>
                </button>

                {/* Tags */}
                <div className="absolute top-4 left-4 flex flex-wrap gap-2">
                  {tagsArray.slice(0, 3).map((tag, index) => (
                    <Badge
                      key={index}
                      variant="outline"
                      className="bg-black/60 backdrop-blur-md border-white/10 text-xs font-medium text-zinc-300"
                    >
                      {tag}
                    </Badge>
                  ))}
                  {tagsArray.length > 3 && (
                    <Badge
                      variant="outline"
                      className="bg-black/60 backdrop-blur-md border-white/10 text-xs font-medium text-zinc-300"
                    >
                      +{tagsArray.length - 3}
                    </Badge>
                  )}
                </div>

                {/* Options menu */}
                <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 rounded-full bg-black/60 backdrop-blur-md border border-white/10"
                      >
                        <MoreHorizontal className="h-4 w-4 text-zinc-300" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent
                      align="end"
                      className="bg-zinc-900 border-zinc-800"
                    >
                      <DropdownMenuItem
                        onClick={handleDownload}
                        className="cursor-pointer text-zinc-300 focus:text-white focus:bg-zinc-800"
                      >
                        <Download className="mr-2 h-4 w-4" />
                        Download
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={handleShare}
                        className="cursor-pointer text-zinc-300 focus:text-white focus:bg-zinc-800"
                      >
                        <Share2 className="mr-2 h-4 w-4" />
                        Share
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => setIsLiked(!isLiked)}
                        className="cursor-pointer text-zinc-300 focus:text-white focus:bg-zinc-800"
                      >
                        <Heart
                          className={cn(
                            "mr-2 h-4 w-4",
                            isLiked && "fill-red-500 text-red-500"
                          )}
                        />
                        {isLiked ? "Unlike" : "Like"}
                      </DropdownMenuItem>
                      <DropdownMenuSeparator className="bg-zinc-800" />
                      <DropdownMenuItem
                        onClick={() => setShowLyrics(!showLyrics)}
                        className="cursor-pointer text-zinc-300 focus:text-white focus:bg-zinc-800"
                      >
                        <Mic2 className="mr-2 h-4 w-4" />
                        {showLyrics ? "Hide Lyrics" : "Show Lyrics"}
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={toggleFullscreen}
                        className="cursor-pointer text-zinc-300 focus:text-white focus:bg-zinc-800"
                      >
                        <ExternalLink className="mr-2 h-4 w-4" />
                        {isFullscreen ? "Exit Fullscreen" : "Fullscreen"}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>

              {/* Player controls and info section */}
              <div
                className={cn(
                  "flex flex-col justify-between transition-all duration-500",
                  isExpanded ? "w-1/2 p-6" : "w-full p-5"
                )}
              >
                {/* Track info */}
                <div className="space-y-1 mb-4">
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold text-white truncate text-lg">
                      {music.title || "Untitled Track"}
                    </h3>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setIsLiked(!isLiked)}
                      className={cn(
                        "h-8 w-8 rounded-full",
                        isLiked
                          ? "text-red-500"
                          : "text-zinc-400 hover:text-white"
                      )}
                      aria-label={isLiked ? "Unlike" : "Like"}
                    >
                      <Heart
                        className={cn("h-5 w-5", isLiked && "fill-red-500")}
                      />
                    </Button>
                  </div>
                  {/* Current lyric display */}
                  {showLyrics && (
                    <div className="mt-3 py-2 px-3 bg-zinc-800/50 rounded-md border border-zinc-700/50 text-center">
                      <p className="text-sm text-zinc-300 italic">
                        {currentLyric}
                      </p>
                    </div>
                  )}
                </div>

                {/* Waveform visualization */}
                {showWaveform && (
                  <div className="relative h-20 mb-4">
                    {isPlaying ? (
                      <canvas
                        ref={canvasRef}
                        width="400"
                        height="80"
                        className="w-full h-full"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center">
                        {waveformData.map((value, index) => (
                          <div
                            key={index}
                            className="w-1 mx-[1px] bg-gradient-to-t from-green-500/80 to-green-400/40 rounded-sm"
                            style={{
                              height: `${value * 100}%`,
                              opacity:
                                index / waveformData.length <
                                progressPercent / 100
                                  ? 1
                                  : 0.4,
                            }}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Custom audio player */}
                <div className="space-y-3">
                  {audioUrl && (
                    <audio
                      ref={audioRef}
                      src={audioUrl}
                      preload="metadata"
                      crossOrigin="anonymous"
                    />
                  )}

                  {/* Spotify-style timeline with needle */}
                  <div
                    ref={progressRef}
                    onClick={handleProgressClick}
                    onMouseMove={handleProgressHover}
                    onMouseLeave={handleProgressLeave}
                    className="relative h-2 bg-zinc-800 rounded-full overflow-hidden cursor-pointer group/progress"
                  >
                    {/* Background track */}
                    <div className="absolute inset-0 w-full h-full">
                      <div className="absolute inset-0 bg-zinc-700/30 w-full h-full" />
                    </div>

                    {/* Progress fill */}
                    <div
                      className="absolute inset-0 h-full bg-gradient-to-r from-green-500 to-green-400 transition-all duration-100"
                      style={{ width: `${progressPercent}%` }}
                    />

                    {/* Hover position indicator */}
                    {hoverPosition !== null && (
                      <div
                        className="absolute top-0 bottom-0 w-0.5 bg-white/70 z-10 pointer-events-none"
                        style={{ left: `${hoverPosition}%` }}
                      />
                    )}

                    {/* Needle pointer */}
                    <div
                      ref={needleRef}
                      className="absolute top-1/2 -translate-y-1/2 h-4 w-4 rounded-full bg-white shadow-lg transform -translate-x-1/2 z-20 transition-all duration-100"
                      style={{ left: `${progressPercent}%` }}
                    />

                    {/* Time markers */}
                    <div className="absolute inset-x-0 bottom-4 flex justify-between text-xs text-zinc-500 pointer-events-none">
                      {[0, 0.25, 0.5, 0.75, 1].map((marker) => (
                        <div
                          key={marker}
                          className="absolute transform -translate-x-1/2"
                          style={{ left: `${marker * 100}%` }}
                        >
                          {formatTime(marker * music.duration)}
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Time and controls */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1">
                      <span className="text-xs font-medium text-zinc-400">
                        {formatTime(currentTime)}
                      </span>
                      <span className="text-xs text-zinc-600">/</span>
                      <span className="text-xs font-medium text-zinc-500">
                        {formatTime(music.duration)}
                      </span>
                    </div>

                    <div className="flex items-center gap-1">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() =>
                              setAudioQuality((prev) =>
                                prev === "high" ? "standard" : "high"
                              )
                            }
                            className="h-8 w-8 text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
                            aria-label="Audio Quality"
                          >
                            <Badge
                              variant={
                                audioQuality === "high" ? "default" : "outline"
                              }
                              className="text-[10px] h-5"
                            >
                              {audioQuality === "high" ? "HD" : "SD"}
                            </Badge>
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent side="top">
                          <p>
                            Audio Quality:{" "}
                            {audioQuality === "high"
                              ? "High Definition"
                              : "Standard"}
                          </p>
                        </TooltipContent>
                      </Tooltip>

                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setShowWaveform(!showWaveform)}
                            className="h-8 w-8 text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
                            aria-label="Toggle Waveform"
                          >
                            <Music2
                              className={cn(
                                "h-4 w-4",
                                showWaveform
                                  ? "text-green-500"
                                  : "text-zinc-400"
                              )}
                            />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent side="top">
                          <p>{showWaveform ? "Hide" : "Show"} Waveform</p>
                        </TooltipContent>
                      </Tooltip>
                    </div>
                  </div>

                  {/* Playback controls */}
                  <div className="flex items-center justify-between">
                    <div className="flex-1 flex items-center justify-center gap-2">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setIsShuffle(!isShuffle)}
                            className={cn(
                              "h-10 w-10 rounded-full",
                              isShuffle
                                ? "text-green-500"
                                : "text-zinc-400 hover:text-white"
                            )}
                            aria-label="Shuffle"
                          >
                            <Shuffle className="h-4 w-4" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent side="top">
                          <p>{isShuffle ? "Disable" : "Enable"} Shuffle</p>
                        </TooltipContent>
                      </Tooltip>

                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-10 w-10 rounded-full text-zinc-400 hover:text-white"
                            aria-label="Previous Track"
                          >
                            <SkipBack className="h-5 w-5" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent side="top">
                          <p>Previous Track</p>
                        </TooltipContent>
                      </Tooltip>

                      <Button
                        onClick={togglePlay}
                        className={cn(
                          "h-14 w-14 rounded-full transition-all duration-300",
                          isPlaying
                            ? "bg-white text-black hover:bg-zinc-200"
                            : "bg-green-500 text-white hover:bg-green-600"
                        )}
                        aria-label={isPlaying ? "Pause" : "Play"}
                      >
                        {isPlaying ? (
                          <Pause className="h-6 w-6" />
                        ) : (
                          <Play className="h-6 w-6 translate-x-0.5" />
                        )}
                      </Button>

                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-10 w-10 rounded-full text-zinc-400 hover:text-white"
                            aria-label="Next Track"
                          >
                            <SkipForward className="h-5 w-5" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent side="top">
                          <p>Next Track</p>
                        </TooltipContent>
                      </Tooltip>

                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setIsRepeat(!isRepeat)}
                            className={cn(
                              "h-10 w-10 rounded-full",
                              isRepeat
                                ? "text-green-500"
                                : "text-zinc-400 hover:text-white"
                            )}
                            aria-label="Repeat"
                          >
                            <Repeat className="h-4 w-4" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent side="top">
                          <p>{isRepeat ? "Disable" : "Enable"} Repeat</p>
                        </TooltipContent>
                      </Tooltip>
                    </div>
                  </div>

                  {/* Volume and additional controls */}
                  <div className="flex items-center justify-between mt-2">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={toggleMute}
                        className="text-zinc-400 hover:text-white transition-colors"
                        aria-label={isMuted ? "Unmute" : "Mute"}
                      >
                        {isMuted ? (
                          <VolumeX className="h-4 w-4" />
                        ) : (
                          <Volume2 className="h-4 w-4" />
                        )}
                      </button>

                      <div className="w-24">
                        <Slider
                          value={[isMuted ? 0 : volume]}
                          min={0}
                          max={1}
                          step={0.01}
                          onValueChange={handleVolumeChange}
                          className="h-1"
                        />
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <Sheet>
                        <SheetTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
                            aria-label="Equalizer"
                          >
                            <ListMusic className="h-4 w-4" />
                          </Button>
                        </SheetTrigger>
                        <SheetContent className="bg-zinc-900 border-zinc-800">
                          <SheetHeader>
                            <SheetTitle className="text-white">
                              Audio Settings
                            </SheetTitle>
                            <SheetDescription className="text-zinc-400">
                              Customize your listening experience
                            </SheetDescription>
                          </SheetHeader>

                          <Tabs defaultValue="equalizer" className="mt-6">
                            <TabsList className="bg-zinc-800">
                              <TabsTrigger value="equalizer">
                                Equalizer
                              </TabsTrigger>
                              <TabsTrigger value="playback">
                                Playback
                              </TabsTrigger>
                              <TabsTrigger value="info">Track Info</TabsTrigger>
                            </TabsList>

                            <TabsContent
                              value="equalizer"
                              className="mt-4 space-y-4"
                            >
                              <div className="space-y-2">
                                <div className="flex items-center justify-between">
                                  <Label
                                    htmlFor="bass"
                                    className="text-zinc-300"
                                  >
                                    Bass
                                  </Label>
                                  <span className="text-xs text-zinc-500">
                                    {equalizerSettings.bass}dB
                                  </span>
                                </div>
                                <Slider
                                  id="bass"
                                  value={[equalizerSettings.bass]}
                                  min={-12}
                                  max={12}
                                  step={1}
                                  onValueChange={(value) =>
                                    handleEqualizerChange("bass", value)
                                  }
                                />
                              </div>

                              <div className="space-y-2">
                                <div className="flex items-center justify-between">
                                  <Label
                                    htmlFor="mid"
                                    className="text-zinc-300"
                                  >
                                    Mid
                                  </Label>
                                  <span className="text-xs text-zinc-500">
                                    {equalizerSettings.mid}dB
                                  </span>
                                </div>
                                <Slider
                                  id="mid"
                                  value={[equalizerSettings.mid]}
                                  min={-12}
                                  max={12}
                                  step={1}
                                  onValueChange={(value) =>
                                    handleEqualizerChange("mid", value)
                                  }
                                />
                              </div>

                              <div className="space-y-2">
                                <div className="flex items-center justify-between">
                                  <Label
                                    htmlFor="treble"
                                    className="text-zinc-300"
                                  >
                                    Treble
                                  </Label>
                                  <span className="text-xs text-zinc-500">
                                    {equalizerSettings.treble}dB
                                  </span>
                                </div>
                                <Slider
                                  id="treble"
                                  value={[equalizerSettings.treble]}
                                  min={-12}
                                  max={12}
                                  step={1}
                                  onValueChange={(value) =>
                                    handleEqualizerChange("treble", value)
                                  }
                                />
                              </div>

                              <div className="space-y-2">
                                <div className="flex items-center justify-between">
                                  <Label
                                    htmlFor="preamp"
                                    className="text-zinc-300"
                                  >
                                    Preamp
                                  </Label>
                                  <span className="text-xs text-zinc-500">
                                    {equalizerSettings.preamp}dB
                                  </span>
                                </div>
                                <Slider
                                  id="preamp"
                                  value={[equalizerSettings.preamp]}
                                  min={-12}
                                  max={12}
                                  step={1}
                                  onValueChange={(value) =>
                                    handleEqualizerChange("preamp", value)
                                  }
                                />
                              </div>

                              <Button variant="outline" className="w-full mt-4">
                                Reset to Default
                              </Button>
                            </TabsContent>

                            <TabsContent
                              value="playback"
                              className="mt-4 space-y-4"
                            >
                              <div className="space-y-2">
                                <div className="flex items-center justify-between">
                                  <Label
                                    htmlFor="playback-speed"
                                    className="text-zinc-300"
                                  >
                                    Playback Speed
                                  </Label>
                                  <span className="text-xs text-zinc-500">
                                    {playbackRate}x
                                  </span>
                                </div>
                                <Slider
                                  id="playback-speed"
                                  value={[playbackRate]}
                                  min={0.5}
                                  max={2}
                                  step={0.05}
                                  onValueChange={handlePlaybackRateChange}
                                />
                              </div>

                              <div className="flex items-center justify-between pt-2">
                                <Label
                                  htmlFor="audio-quality"
                                  className="text-zinc-300"
                                >
                                  High Quality Audio
                                </Label>
                                <Switch
                                  id="audio-quality"
                                  checked={audioQuality === "high"}
                                  onCheckedChange={(checked) =>
                                    setAudioQuality(
                                      checked ? "high" : "standard"
                                    )
                                  }
                                />
                              </div>

                              <div className="flex items-center justify-between pt-2">
                                <Label
                                  htmlFor="show-waveform"
                                  className="text-zinc-300"
                                >
                                  Show Waveform
                                </Label>
                                <Switch
                                  id="show-waveform"
                                  checked={showWaveform}
                                  onCheckedChange={setShowWaveform}
                                />
                              </div>
                            </TabsContent>

                            <TabsContent
                              value="info"
                              className="mt-4 space-y-4"
                            >
                              <div className="space-y-1">
                                <p className="text-xs text-zinc-500">Title</p>
                                <p className="text-sm text-zinc-300">
                                  {music.title || "Unknown"}
                                </p>
                              </div>

                              <div className="space-y-1">
                                <p className="text-xs text-zinc-500">
                                  Duration
                                </p>
                                <p className="text-sm text-zinc-300">
                                  {formatTime(music.duration)}
                                </p>
                              </div>

                              <div className="space-y-1">
                                <p className="text-xs text-zinc-500">Created</p>
                                <p className="text-sm text-zinc-300">
                                  {music.createTime
                                    ? new Date(
                                        music.createTime
                                      ).toLocaleDateString()
                                    : "Unknown"}
                                </p>
                              </div>

                              <div className="space-y-1">
                                <p className="text-xs text-zinc-500">Tags</p>
                                <div className="flex flex-wrap gap-1 mt-1">
                                  {tagsArray.map((tag, index) => (
                                    <Badge
                                      key={index}
                                      variant="outline"
                                      className="text-xs"
                                    >
                                      {tag}
                                    </Badge>
                                  ))}
                                </div>
                              </div>
                            </TabsContent>
                          </Tabs>
                        </SheetContent>
                      </Sheet>

                      <Button
                        onClick={handleDownload}
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
                        disabled={isDownloading}
                        aria-label="Download"
                      >
                        <Download className="h-4 w-4" />
                      </Button>

                      <Button
                        onClick={handleShare}
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
                        aria-label="Share"
                      >
                        <Share2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>

                {/* Lyrics section (expanded view only) */}
                {isExpanded && showLyrics && (
                  <div className="mt-6 border-t border-zinc-800 pt-4">
                    <h4 className="text-sm font-medium text-zinc-300 mb-3 flex items-center gap-2">
                      <Mic2 className="h-4 w-4" />
                      Lyrics
                    </h4>
                    <div className="space-y-4 max-h-40 overflow-y-auto pr-2 scrollbar-thin">
                      {mockLyrics.map((lyric, index) => (
                        <div
                          key={index}
                          className={cn(
                            "py-1 transition-all duration-300",
                            currentTime >= lyric.time &&
                              currentTime <
                                (mockLyrics[index + 1]?.time ||
                                  Number.POSITIVE_INFINITY)
                              ? "text-white font-medium"
                              : "text-zinc-500"
                          )}
                        >
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-zinc-600">
                              {formatTime(lyric.time)}
                            </span>
                            <p>{lyric.text}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </TooltipProvider>
  );
}
