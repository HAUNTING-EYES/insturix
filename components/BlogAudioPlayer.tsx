"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Play, Pause, Volume2, VolumeX } from "lucide-react";

interface BlogAudioPlayerProps {
  audioUrl: string;
  title?: string;
}

const PLAYBACK_SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2];

export default function BlogAudioPlayer({
  audioUrl,
  title = "Listen to this article",
}: BlogAudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const progressRef = useRef<HTMLDivElement>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [audioLoaded, setAudioLoaded] = useState(false);
  const [showSpeedMenu, setShowSpeedMenu] = useState(false);

  const formatTime = (time: number): string => {
    if (!isFinite(time) || isNaN(time)) return "0:00";
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds.toString().padStart(2, "0")}`;
  };

  const togglePlay = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;

    // Load audio source on first play
    if (!audioLoaded) {
      audio.src = audioUrl;
      setAudioLoaded(true);
    }

    if (isPlaying) {
      audio.pause();
    } else {
      audio.play();
    }
    setIsPlaying(!isPlaying);
  }, [isPlaying, audioLoaded, audioUrl]);

  const toggleMute = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.muted = !isMuted;
    setIsMuted(!isMuted);
  }, [isMuted]);

  const changeSpeed = useCallback((speed: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.playbackRate = speed;
    setPlaybackSpeed(speed);
    setShowSpeedMenu(false);
  }, []);

  const handleProgressClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const audio = audioRef.current;
      const progress = progressRef.current;
      if (!audio || !progress) return;
      const rect = progress.getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      const percentage = clickX / rect.width;
      const newTime = percentage * duration;
      audio.currentTime = newTime;
      setCurrentTime(newTime);
    },
    [duration]
  );

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleTimeUpdate = () => setCurrentTime(audio.currentTime);
    const handleLoadedMetadata = () => setDuration(audio.duration);
    const handleEnded = () => setIsPlaying(false);
    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);

    audio.addEventListener("timeupdate", handleTimeUpdate);
    audio.addEventListener("loadedmetadata", handleLoadedMetadata);
    audio.addEventListener("ended", handleEnded);
    audio.addEventListener("play", handlePlay);
    audio.addEventListener("pause", handlePause);

    return () => {
      audio.removeEventListener("timeupdate", handleTimeUpdate);
      audio.removeEventListener("loadedmetadata", handleLoadedMetadata);
      audio.removeEventListener("ended", handleEnded);
      audio.removeEventListener("play", handlePlay);
      audio.removeEventListener("pause", handlePause);
    };
  }, []);

  useEffect(() => {
    const handleClickOutside = () => setShowSpeedMenu(false);
    if (showSpeedMenu) {
      document.addEventListener("click", handleClickOutside);
      return () => document.removeEventListener("click", handleClickOutside);
    }
  }, [showSpeedMenu]);

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div className="bg-black border border-neutral-800 rounded-lg p-4 mb-10">
      <audio
        ref={audioRef}
        preload="none"
        controls={false}
        crossOrigin="anonymous"
      />

      {/* Top row: play button, progress, time, controls */}
      <div className="flex items-center gap-3">
        {/* Play/Pause */}
        <button
          onClick={togglePlay}
          className="w-9 h-9 flex-shrink-0 rounded-md bg-white flex items-center justify-center hover:bg-neutral-200 transition-colors"
          title={isPlaying ? "Pause" : "Play"}
        >
          {isPlaying ? (
            <Pause className="w-4 h-4 text-black" fill="black" />
          ) : (
            <Play className="w-4 h-4 text-black ml-0.5" fill="black" />
          )}
        </button>

        {/* Progress bar */}
        <div
          ref={progressRef}
          onClick={handleProgressClick}
          className="flex-1 h-1 bg-neutral-700 rounded-full cursor-pointer group relative"
        >
          <div
            className="h-full bg-white rounded-full transition-all"
            style={{ width: `${progress}%` }}
          />
          <div
            className="absolute top-1/2 -translate-y-1/2 w-2.5 h-2.5 bg-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
            style={{ left: `calc(${progress}% - 5px)` }}
          />
        </div>

        {/* Time */}
        <span className="text-xs text-neutral-400 font-mono min-w-[70px] text-right">
          {audioLoaded ? `${formatTime(currentTime)} / ${formatTime(duration)}` : '--:-- / --:--'}
        </span>

        {/* Speed */}
        <div className="relative">
          <button
            onClick={(e) => {
              e.stopPropagation();
              setShowSpeedMenu(!showSpeedMenu);
            }}
            className="text-xs text-neutral-400 hover:text-white transition-colors px-2 py-1 rounded bg-neutral-900 hover:bg-neutral-800 font-medium min-w-[42px]"
          >
            {playbackSpeed}x
          </button>
          {showSpeedMenu && (
            <div
              className="absolute right-0 bottom-full mb-1 bg-neutral-900 border border-neutral-700 rounded-md shadow-xl overflow-hidden z-50"
              onClick={(e) => e.stopPropagation()}
            >
              {PLAYBACK_SPEEDS.map((speed) => (
                <button
                  key={speed}
                  onClick={() => changeSpeed(speed)}
                  className={`block w-full px-3 py-1.5 text-xs text-left transition-colors ${
                    playbackSpeed === speed
                      ? "bg-white text-black"
                      : "text-neutral-300 hover:bg-neutral-800"
                  }`}
                >
                  {speed}x
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Mute */}
        <button
          onClick={toggleMute}
          className="text-neutral-400 hover:text-white transition-colors"
          title={isMuted ? "Unmute" : "Mute"}
        >
          {isMuted ? (
            <VolumeX className="w-4 h-4" />
          ) : (
            <Volume2 className="w-4 h-4" />
          )}
        </button>
      </div>
    </div>
  );
}
