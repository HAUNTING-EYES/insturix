"use client";

import type React from "react";
import { useState, useRef, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Music2, Play, Pause, Volume2, VolumeX } from "lucide-react";
import Image from "next/image";
import { cn } from "@/lib/utils";

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
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);
  const progressRef = useRef<HTMLDivElement>(null);

  const audioUrl = music.source_stream_audio_url || music.stream_audio_url;
  const imageUrl = music.source_image_url || music.image_url;

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const updateTime = () => setCurrentTime(audio.currentTime);
    const handleEnded = () => setIsPlaying(false);

    audio.addEventListener("timeupdate", updateTime);
    audio.addEventListener("ended", handleEnded);

    return () => {
      audio.removeEventListener("timeupdate", updateTime);
      audio.removeEventListener("ended", handleEnded);
    };
  }, []);

  const togglePlay = () => {
    if (!audioRef.current) return;

    if (isPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.play();
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
    audioRef.current.currentTime = percent * music.duration;
  };

  const formatTime = (time: number) => {
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds.toString().padStart(2, "0")}`;
  };

  const progressPercent = (currentTime / music.duration) * 100;

  return (
    <Card className="group overflow-hidden bg-gradient-to-br from-zinc-900 to-black border-zinc-800 hover:border-zinc-700 transition-all duration-500">
      <CardContent className="p-0">
        <div className="relative">
          {/* Image with overlay */}
          <div className="relative w-full aspect-square overflow-hidden">
            <Image
              src={imageUrl || "/placeholder.svg"}
              alt={music.title}
              fill
              className="object-cover transition-transform duration-700 group-hover:scale-110 group-hover:rotate-1"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-transparent opacity-70 group-hover:opacity-80 transition-opacity duration-500" />
            {/* Play button overlay */}
            <button
              onClick={togglePlay}
              className="absolute inset-0 flex items-center justify-center"
            >
              <div
                className={cn(
                  "flex items-center justify-center w-16 h-16 rounded-full bg-white/10 backdrop-blur-md border border-white/20",
                  "transform transition-all duration-500",
                  "group-hover:scale-110 group-hover:bg-white/20",
                  isPlaying ? "scale-90 bg-white/20" : "scale-100"
                )}
              >
                {isPlaying ? (
                  <Pause className="w-8 h-8 text-white fill-white" />
                ) : (
                  <Play className="w-8 h-8 text-white fill-white translate-x-0.5" />
                )}
              </div>
            </button>

            {/* Tags pill */}
            <div className="absolute top-4 left-4">
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-black/60 backdrop-blur-md border border-white/10 text-xs font-medium text-zinc-300">
                <Music2 className="h-3 w-3" />
                {music.tags}
              </div>
            </div>
          </div>

          {/* Audio content */}
          <div className="p-5 space-y-4">
            {/* Custom audio player */}
            <div className="space-y-2">
              <audio ref={audioRef} src={audioUrl} preload="metadata" />

              {/* Progress bar */}
              <div
                ref={progressRef}
                onClick={handleProgressClick}
                className="h-1.5 bg-zinc-800 rounded-full overflow-hidden cursor-pointer group/progress"
              >
                <div
                  className="h-full bg-gradient-to-r from-purple-500 to-pink-500 group-hover/progress:from-purple-400 group-hover/progress:to-pink-400 transition-all duration-300"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>

              {/* Controls */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <button
                    onClick={toggleMute}
                    className="text-zinc-400 hover:text-white transition-colors"
                  >
                    {isMuted ? (
                      <VolumeX className="h-4 w-4" />
                    ) : (
                      <Volume2 className="h-4 w-4" />
                    )}
                  </button>

                  <span className="text-xs font-medium text-zinc-400">
                    {formatTime(currentTime)} / {formatTime(music.duration)}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
