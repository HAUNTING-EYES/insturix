import { useState, useEffect, useRef, useCallback } from "react";
import { PlayerRef } from "@remotion/player";
import { FPS } from "../constants";

/**
 * Custom hook for managing video player functionality
 * @returns An object containing video player controls and state
 */
export const useVideoPlayer = () => {
  // State management
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentFrame, setCurrentFrame] = useState(0);
  const playerRef = useRef<PlayerRef>(null);

  // Sync local isPlaying state with actual Remotion Player events
  useEffect(() => {
    const player = playerRef.current;
    if (!player) return;

    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);
    const handleEnded = () => setIsPlaying(false);

    player.addEventListener('play', handlePlay);
    player.addEventListener('pause', handlePause);
    player.addEventListener('ended', handleEnded);

    return () => {
      player.removeEventListener('play', handlePlay);
      player.removeEventListener('pause', handlePause);
      player.removeEventListener('ended', handleEnded);
    };
  }, [playerRef]);

  // Frame update effect - throttled to reduce re-renders
  // The Remotion Player handles actual video playback internally at full frame rate
  // We only need to update the frame state for UI display (timeline marker, time display)
  useEffect(() => {
    // Only run the rAF loop when playing to save CPU when paused
    if (!isPlaying) return;

    let animationFrameId: number;
    let lastFrame = -1;
    let frameCount = 0;
    const UPDATE_EVERY_N_FRAMES = 3; // Only update state every 3 frames to reduce re-renders

    const updateCurrentFrame = () => {
      if (playerRef.current) {
        const frame = Math.round(playerRef.current.getCurrentFrame());
        // Only update state if frame actually changed AND we've waited enough frames
        if (frame !== lastFrame) {
          frameCount++;
          // Update every N frames, or immediately if the frame changed significantly (seeking)
          const frameDelta = Math.abs(frame - lastFrame);
          if (frameCount >= UPDATE_EVERY_N_FRAMES || frameDelta > UPDATE_EVERY_N_FRAMES) {
            lastFrame = frame;
            frameCount = 0;
            setCurrentFrame(frame);
          }
        }
      }
      animationFrameId = requestAnimationFrame(updateCurrentFrame);
    };

    // Start the animation frame loop
    animationFrameId = requestAnimationFrame(updateCurrentFrame);

    // Clean up
    return () => {
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
      }
    };
  }, [isPlaying]);

  /**
   * Starts playing the video
   */
  const play = useCallback(() => {
    if (playerRef.current) {
      playerRef.current.play();
    }
  }, [playerRef]);

  /**
   * Toggles between play and pause states
   */
  const togglePlayPause = useCallback(() => {
    if (playerRef.current) {
      if (!isPlaying) {
        playerRef.current.play();
      } else {
        playerRef.current.pause();
      }
      setIsPlaying(!isPlaying);
    }
  }, [playerRef, isPlaying]);

  /**
   * Converts frame count to formatted time string
   * @param frames - Number of frames to convert
   * @returns Formatted time string in MM:SS format
   */
  const formatTime = useCallback((frames: number) => {
    const totalSeconds = frames / FPS;
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = Math.floor(totalSeconds % 60);
    const frames2Digits = Math.floor(frames % FPS)
      .toString()
      .padStart(2, "0");

    return `${minutes.toString().padStart(2, "0")}:${seconds
      .toString()
      .padStart(2, "0")}.${frames2Digits}`;
  }, []);

  /**
   * Seeks to a specific frame in the video
   * @param frame - Target frame number
   */
  const seekTo = useCallback(
    (frame: number) => {
      if (playerRef.current) {
        setCurrentFrame(frame);
        playerRef.current.seekTo(frame);
      }
    },
    [playerRef]
  );

  return {
    isPlaying,
    currentFrame,
    playerRef,
    togglePlayPause,
    formatTime,
    play,
    seekTo,
  };
};
