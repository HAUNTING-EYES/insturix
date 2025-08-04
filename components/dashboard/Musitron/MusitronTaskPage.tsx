"use client";

import React, { useState, useRef, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Music2, AlertCircle, CheckCircle2, Clock, Play, Pause, Volume2, SkipBack, SkipForward, ArrowLeft } from "lucide-react";

const demoTasks = {
  "demo-complete": {
    _id: "demo-complete",
    status: "complete",
    title: "Completed Demo Track",
    createdAt: new Date(),
    updatedAt: new Date(),
    description: "This is a completed demo music track.",
    audioUrl: "/demo-audio.mp3",
    imageUrl: "/placeholder.svg",
  },
  "demo-failed": {
    _id: "demo-failed",
    status: "failed",
    title: "Failed Demo Track",
    createdAt: new Date(),
    updatedAt: new Date(),
    description: "This task failed due to an error.",
    error: "Demo error: Something went wrong.",
    imageUrl: "/placeholder.svg",
  },
};

const CustomAudioPlayer: React.FC<{ src: string; imageUrl: string; title: string }> = ({ src }) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const audioRef = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const updateTime = () => setCurrentTime(audio.currentTime);
    const updateDuration = () => setDuration(audio.duration);
    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);
    const handleEnded = () => setIsPlaying(false);

    audio.addEventListener('timeupdate', updateTime);
    audio.addEventListener('loadedmetadata', updateDuration);
    audio.addEventListener('play', handlePlay);
    audio.addEventListener('pause', handlePause);
    audio.addEventListener('ended', handleEnded);

    return () => {
      audio.removeEventListener('timeupdate', updateTime);
      audio.removeEventListener('loadedmetadata', updateDuration);
      audio.removeEventListener('play', handlePlay);
      audio.removeEventListener('pause', handlePause);
      audio.removeEventListener('ended', handleEnded);
    };
  }, []);

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio) return;

    if (isPlaying) {
      audio.pause();
      setIsPlaying(false);
    } else {
      audio.play();
      setIsPlaying(true);
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const audio = audioRef.current;
    if (!audio) return;

    const newTime = parseFloat(e.target.value);
    audio.currentTime = newTime;
    setCurrentTime(newTime);
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const audio = audioRef.current;
    if (!audio) return;

    const newVolume = parseFloat(e.target.value);
    audio.volume = newVolume;
    setVolume(newVolume);
  };

  const formatTime = (time: number) => {
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  const skipTime = (seconds: number) => {
    const audio = audioRef.current;
    if (!audio) return;

    audio.currentTime = Math.max(0, Math.min(duration, audio.currentTime + seconds));
  };

  return (
    <div className="bg-black/60 border border-zinc-700 rounded-xl p-4 overflow-hidden relative">
      <div className="relative z-10">
        <audio ref={audioRef} src={src} />
        {/* Main Controls */}
        <div className="flex items-center gap-4 mb-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => skipTime(-10)}
            className="text-zinc-400 hover:text-zinc-100"
          >
            <SkipBack className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="lg"
            onClick={togglePlay}
            className="text-zinc-100 hover:text-yellow-400 bg-yellow-500/20 hover:bg-yellow-500/30 rounded-full"
          >
            {isPlaying ? <Pause className="h-6 w-6" /> : <Play className="h-6 w-6" />}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => skipTime(10)}
            className="text-zinc-400 hover:text-zinc-100"
          >
            <SkipForward className="h-4 w-4" />
          </Button>
        </div>
        {/* Progress Bar */}
        <div className="mb-4">
          <div className="flex items-center justify-between text-xs text-zinc-400 mb-2">
            <span>{formatTime(currentTime)}</span>
            <span>{formatTime(duration)}</span>
          </div>
          <input
            type="range"
            min="0"
            max={duration || 0}
            value={currentTime}
            onChange={handleSeek}
            className="w-full h-2 bg-zinc-700 rounded-lg appearance-none cursor-pointer slider"
            style={{
              background: `linear-gradient(to right, #eab308 0%, #eab308 ${(currentTime / duration) * 100}%, #3f3f46 ${(currentTime / duration) * 100}%, #3f3f46 100%)`
            }}
          />
        </div>
        {/* Volume Control */}
        <div className="flex items-center gap-2">
          <Volume2 className="h-4 w-4 text-zinc-400" />
          <input
            type="range"
            min="0"
            max="1"
            step="0.1"
            value={volume}
            onChange={handleVolumeChange}
            className="w-20 h-2 bg-zinc-700 rounded-lg appearance-none cursor-pointer slider"
            style={{
              background: `linear-gradient(to right, #eab308 0%, #eab308 ${volume * 100}%, #3f3f46 ${volume * 100}%, #3f3f46 100%)`
            }}
          />
        </div>
      </div>
      <style jsx>{`
        .slider::-webkit-slider-thumb {
          appearance: none;
          height: 16px;
          width: 16px;
          border-radius: 50%;
          background: #eab308;
          cursor: pointer;
          border: 2px solid #000;
        }
        .slider::-moz-range-thumb {
          height: 16px;
          width: 16px;
          border-radius: 50%;
          background: #eab308;
          cursor: pointer;
          border: 2px solid #000;
        }
      `}</style>
    </div>
  );
};

export default function MusitronTaskPage() {
  const params = useParams();
  const router = useRouter();
  const id = typeof params?.id === "string" ? params.id : Array.isArray(params?.id) ? params.id[0] : "demo-complete";
  const task = demoTasks[id as keyof typeof demoTasks] || demoTasks["demo-complete"];

  return (
    <div className="max-w-2xl mx-auto w-full px-2 sm:px-4 py-8">
      <div className="flex items-center mb-6">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.push("/dashboard/musitron")}
          className="text-zinc-400 hover:text-zinc-100"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to History
        </Button>
      </div>
      <Card className="bg-black/40 border-zinc-800 backdrop-blur-xl">
        <CardContent className="p-6">
          <div className="flex items-center gap-4 mb-4">
            <Music2 className="h-10 w-10 text-zinc-400" />
            <div>
              <h2 className="text-xl font-semibold text-zinc-100">{task.title}</h2>
              <div className="flex items-center gap-2 text-xs text-zinc-500 mt-1">
                <Clock className="h-3 w-3" />
                {new Date(task.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </div>
            </div>
          </div>
          <div className="mb-4 text-zinc-300">{task.description}</div>
          {task.status === "complete" && "audioUrl" in task && (
            <div className="mb-4">
              <CheckCircle2 className="h-5 w-5 text-green-400 inline mr-2" />
              <span className="text-green-300 font-medium">Completed</span>
              <div className="mt-4">
                <CustomAudioPlayer src={task.audioUrl} imageUrl={task.imageUrl} title={task.title} />
              </div>
            </div>
          )}
          {task.status === "failed" && "error" in task && (
            <div className="mb-4">
              <AlertCircle className="h-5 w-5 text-red-400 inline mr-2" />
              <span className="text-red-300 font-medium">Failed</span>
              <div className="mt-2 text-red-400 text-sm">{task.error}</div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

