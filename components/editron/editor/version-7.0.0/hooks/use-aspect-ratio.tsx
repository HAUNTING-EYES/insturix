import { useState, useCallback } from "react";
import { AspectRatio } from "../types";

/**
 * Custom hook for managing aspect ratio and player dimensions.
 * @param initialRatio - The initial aspect ratio to use (default: "16:9")
 * @param onRatioChange - Callback function to call when the aspect ratio changes (optional)
 * @returns An object containing aspect ratio state and related functions
 */

export const useAspectRatio = (
  initialRatio: AspectRatio = "16:9",
  onRatioChange?: (ratio: AspectRatio) => void
) => {
  // Single source of truth for aspect ratio
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>(initialRatio);

  const handleAspectRatioChange = useCallback(
    (newRatio: AspectRatio) => {
      setAspectRatio(newRatio);
      onRatioChange?.(newRatio);
    },
    [onRatioChange]
  );

  const [playerDimensions, setPlayerDimensions] = useState({
    width: 640,
    height: 360,
  }); // Default 16:9 dimensions

  /**
   * Updates the player dimensions based on the container size and current aspect ratio.
   * @param containerWidth - The width of the container
   * @param containerHeight - The height of the container
   */
  const updatePlayerDimensions = useCallback(
    (containerWidth: number, containerHeight: number) => {
      let width, height;

      // Calculate target aspect ratio
      const targetRatio =
        aspectRatio === "16:9"
          ? 16 / 9
          : aspectRatio === "9:16"
          ? 9 / 16
          : aspectRatio === "1:1"
          ? 1
          : 4 / 5;

      // Compare container ratio with target ratio to determine fitting strategy
      const containerRatio = containerWidth / containerHeight;

      if (containerRatio > targetRatio) {
        // Container is wider than target ratio - fit to height
        height = containerHeight;
        width = height * targetRatio;
      } else {
        // Container is taller than target ratio - fit to width
        width = containerWidth;
        height = width / targetRatio;
      }

      setPlayerDimensions({ width, height });
    },
    [aspectRatio]
  );

  /**
   * Returns the standard dimensions for the current aspect ratio.
   * @returns An object containing the width and height for the current aspect ratio
   */
  const getAspectRatioDimensions = useCallback(() => {
    switch (aspectRatio) {
      case "9:16":
        return { width: 1080, height: 1920 }; // TikTok/Story
      case "4:5":
        return { width: 1080, height: 1350 }; // Instagram Post
      case "1:1":
        return { width: 1080, height: 1080 }; // Square Post
      case "16:9":
        return { width: 1920, height: 1080 }; // YouTube/Landscape
      default:
        return { width: 1920, height: 1080 }; // Laptop (16:9)
    }
  }, [aspectRatio]);

  /**
   * Calculates dimensions for media to fit within the current frame
   * while preserving its original aspect ratio.
   *
   * @param mediaWidth - Original width of the media
   * @param mediaHeight - Original height of the media
   * @returns Scaled dimensions that fit within the current aspect ratio frame
   */
  const calculateFitToFrameDimensions = useCallback(
    (mediaWidth: number, mediaHeight: number) => {
      const {
        width: frameWidth,
        height: frameHeight,
      } = getAspectRatioDimensions();
      const mediaRatio = mediaWidth / mediaHeight;
      const frameRatio = frameWidth / frameHeight;

      let finalWidth, finalHeight;

      if (mediaRatio > frameRatio) {
        // Media is wider than frame - fit to width
        finalWidth = frameWidth;
        finalHeight = frameWidth / mediaRatio;
      } else {
        // Media is taller than frame - fit to height
        finalHeight = frameHeight;
        finalWidth = frameHeight * mediaRatio;
      }

      return {
        width: Math.round(finalWidth),
        height: Math.round(finalHeight),
      };
    },
    [getAspectRatioDimensions]
  );

  return {
    aspectRatio,
    setAspectRatio: handleAspectRatioChange,
    playerDimensions,
    updatePlayerDimensions,
    getAspectRatioDimensions,
    calculateFitToFrameDimensions,
  };
};
