import React, { useEffect } from "react";
import { Player, PlayerRef } from "@remotion/player";
import { Main } from "../../remotion/main";
import { useEditorContext } from "../../contexts/editor-context";
import { FPS } from "../../constants";

/**
 * Props for the VideoPlayer component
 * @interface VideoPlayerProps
 * @property {React.RefObject<PlayerRef>} playerRef - Reference to the Remotion player instance
 */
interface VideoPlayerProps {
  playerRef: React.RefObject<PlayerRef>;
}

/**
 * VideoPlayer component that renders a responsive video editor with overlay support
 * The player automatically resizes based on its container and maintains the specified aspect ratio
 */
export const VideoPlayer: React.FC<VideoPlayerProps> = ({ playerRef }) => {
  const {
    overlays,
    setSelectedOverlayId,
    changeOverlay,
    selectedOverlayId,
    aspectRatio,
    playerDimensions,
    updatePlayerDimensions,
    getAspectRatioDimensions,
    durationInFrames,
  } = useEditorContext();

  /**
   * Updates the player dimensions when the container size or aspect ratio changes
   */
  useEffect(() => {
    const handleDimensionUpdate = () => {
      const videoContainer = document.querySelector(".video-container");
      if (!videoContainer) return;

      const { width, height } = videoContainer.getBoundingClientRect();
      updatePlayerDimensions(width, height);
    };

    handleDimensionUpdate(); // Initial update
    window.addEventListener("resize", handleDimensionUpdate);

    return () => {
      window.removeEventListener("resize", handleDimensionUpdate);
    };
  }, [aspectRatio, updatePlayerDimensions]);

  const { width: compositionWidth, height: compositionHeight } =
    getAspectRatioDimensions();

  // Constants for player configuration
  const PLAYER_CONFIG = {
    durationInFrames: Math.round(durationInFrames),
    fps: FPS,
  };

  return (
    <div className="w-full h-full overflow-hidden">
      {/* Grid background container */}
      <div
        id="remotion-player-container"
        className="z-0 video-container relative w-full h-full
        bg-zinc-100/90 dark:bg-zinc-900
        bg-[linear-gradient(to_right,#71717a15_1px,transparent_1px),linear-gradient(to_bottom,#71717a15_1px,transparent_1px)] 
        dark:bg-[linear-gradient(to_right,#71717a20_1px,transparent_1px),linear-gradient(to_bottom,#71717a20_1px,transparent_1px)]
        bg-[size:16px_16px] 
        shadow-lg"
      >
        {/* Player wrapper with centering */}
        <div className="z-10 absolute inset-2 sm:inset-4 flex items-center justify-center">
          <div
            className="relative mx-2 sm:mx-0"
            style={{
              width: Math.min(Number.isFinite(playerDimensions.width) ? playerDimensions.width : 0, Number.isFinite(compositionWidth) ? compositionWidth : 0) || "100%",
              height: Math.min(Number.isFinite(playerDimensions.height) ? playerDimensions.height : 0, Number.isFinite(compositionHeight) ? compositionHeight : 0) || "100%",
              maxWidth: "100%",
              maxHeight: "100%",
            }}
          >
            <Player
              ref={playerRef}
              className="w-full h-full"
              component={Main}
              compositionWidth={compositionWidth}
              compositionHeight={compositionHeight}
              style={{
                width: "100%",
                height: "100%",
              }}
              durationInFrames={PLAYER_CONFIG.durationInFrames}
              fps={PLAYER_CONFIG.fps}
              inputProps={{
                overlays,
                setSelectedOverlayId,
                changeOverlay,
                selectedOverlayId,
                durationInFrames,
                fps: FPS,
                width: compositionWidth,
                height: compositionHeight,
              }}
              errorFallback={() => <></>}
              // Render a custom white play/pause icon for the overlay controls so
              // it's clearly visible over the black video background in light
              // mode (and still visible in dark mode as well).
              renderPlayPauseButton={({ playing }: { playing: boolean }) =>
                playing ? (
                  <div className="flex items-center justify-center w-8 h-8 rounded-full bg-black/60">
                    <svg
                      className="w-4 h-4 text-white"
                      viewBox="0 0 24 24"
                      fill="none"
                      xmlns="http://www.w3.org/2000/svg"
                    >
                      <rect x="6" y="5" width="3" height="14" fill="currentColor" />
                      <rect x="15" y="5" width="3" height="14" fill="currentColor" />
                    </svg>
                  </div>
                ) : (
                  <div className="flex items-center justify-center w-8 h-8 rounded-full bg-black/60">
                    <svg
                      className="w-4 h-4 text-white"
                      viewBox="0 0 24 24"
                      fill="none"
                      xmlns="http://www.w3.org/2000/svg"
                    >
                      <path d="M8 5v14l11-7L8 5z" fill="currentColor" />
                    </svg>
                  </div>
                )
              }
              overflowVisible
              acknowledgeRemotionLicense
            />
          </div>
        </div>
      </div>
    </div>
  );
};
