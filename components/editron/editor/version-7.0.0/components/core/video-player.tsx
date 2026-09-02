import React, { useEffect, useMemo, useRef, useState } from "react";
import { Player, PlayerRef } from "@remotion/player";
import { Main } from "../../remotion/main";
import { useEditorContext } from "../../contexts/editor-context";
import { FPS } from "../../constants";
import { OverlayType } from "../../types";
import {
  createNativeMediaTimestampPreviewAudioPlayerBridgeV1,
  type NativeMediaTimestampPreviewAudioPlayerBridgeV1,
} from "../../remotion/native-media-timestamp-preview-audio-player-bridge-v1";
import {
  createNativeMediaTimestampPreviewAudioSessionCoordinatorV1,
} from "../../remotion/native-media-timestamp-preview-audio-session-v1";
import {
  createNativeMediaTimestampPreviewWebAudioRuntimeV1,
} from "../../remotion/native-media-timestamp-preview-audio-scheduler-v1";
import {
  createNativeMediaTimestampPreviewSessionCoordinatorV1,
  createNativeMediaTimestampPreviewSessionHttpPortV1,
  selectNativeMediaTimestampPreviewClientGateV1,
  selectNativeMediaTimestampPreviewPlayableOverlaysV1,
} from "../../remotion/native-media-timestamp-preview-session-client-v1";
import { createVideoNativeAudioMixV1 } from "../../utils/video-native-audio-mix-v1";

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
const VideoPlayerInner: React.FC<VideoPlayerProps> = ({ playerRef }) => {
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
    playbackRate,
    currentFrame,
    projectId,
    projectRevision,
  } = useEditorContext();
  const [timestampPreviewCoordinator] = useState(() => (
    createNativeMediaTimestampPreviewSessionCoordinatorV1(
      createNativeMediaTimestampPreviewSessionHttpPortV1(),
    )
  ));
  const [timestampPreviewSnapshot, setTimestampPreviewSnapshot] = useState(
    () => timestampPreviewCoordinator.snapshot(),
  );
  const [timestampPreviewAudioCoordinator] = useState(() => (
    createNativeMediaTimestampPreviewAudioSessionCoordinatorV1(
      createNativeMediaTimestampPreviewWebAudioRuntimeV1(),
    )
  ));
  const [timestampPreviewAudioSnapshot, setTimestampPreviewAudioSnapshot] = useState(
    () => timestampPreviewAudioCoordinator.snapshot(),
  );
  const timestampPreviewAudioBridge = useRef<
    NativeMediaTimestampPreviewAudioPlayerBridgeV1 | null
  >(null);
  const timestampPreviewLifecycle = useRef(0);

  useEffect(
    () => timestampPreviewCoordinator.subscribe(setTimestampPreviewSnapshot),
    [timestampPreviewCoordinator],
  );
  useEffect(
    () => timestampPreviewAudioCoordinator.subscribe(setTimestampPreviewAudioSnapshot),
    [timestampPreviewAudioCoordinator],
  );

  useEffect(() => {
    const lifecycle = ++timestampPreviewLifecycle.current;
    return () => {
      queueMicrotask(() => {
        if (timestampPreviewLifecycle.current === lifecycle) {
          void Promise.all([
            timestampPreviewCoordinator.dispose(),
            timestampPreviewAudioCoordinator.dispose(),
          ]);
        }
      });
    };
  }, [timestampPreviewAudioCoordinator, timestampPreviewCoordinator]);

  useEffect(() => {
    timestampPreviewCoordinator.update({
      projectId: projectId ?? "",
      sequenceId: "main",
      projectRevision,
      currentFrame,
      overlays,
    });
  }, [currentFrame, overlays, projectId, projectRevision, timestampPreviewCoordinator]);

  const timestampPreviewAudioMixes = useMemo(() => {
    const pcmOverlayIds = new Set(timestampPreviewSnapshot.sessionWindows.flatMap((window) => (
      window.audioWindow?.segments.some((segment) => segment.kind === "PCM")
        ? [window.pictureWindow.overlayId]
        : []
    )));
    const mixes = new Map<string, ReturnType<typeof createVideoNativeAudioMixV1>>();
    for (const overlay of overlays) {
      const overlayId = String(overlay.id);
      if (overlay.type !== OverlayType.VIDEO || !pcmOverlayIds.has(overlayId)) continue;
      mixes.set(overlayId, createVideoNativeAudioMixV1({
        overlay,
        allOverlays: overlays,
        fps: FPS,
        audioPresent: true,
      }));
    }
    if (mixes.size !== pcmOverlayIds.size) {
      throw new Error("NATIVE_MEDIA_PREVIEW_AUDIO_PLAYER_OVERLAY_MIX_MISSING");
    }
    return mixes;
  }, [overlays, timestampPreviewSnapshot.sessionWindows]);

  useEffect(() => {
    const player = playerRef.current;
    if (!player) return;
    const bridge = createNativeMediaTimestampPreviewAudioPlayerBridgeV1(
      player,
      timestampPreviewAudioCoordinator,
    );
    timestampPreviewAudioBridge.current = bridge;
    return () => {
      if (timestampPreviewAudioBridge.current === bridge) {
        timestampPreviewAudioBridge.current = null;
      }
      bridge.dispose();
    };
  }, [playerRef, timestampPreviewAudioCoordinator]);

  useEffect(() => {
    timestampPreviewAudioBridge.current?.updateMedia({
      sessionWindows: timestampPreviewSnapshot.sessionWindows,
      mixesByOverlayId: timestampPreviewAudioMixes,
      playbackRate,
    });
  }, [playbackRate, timestampPreviewAudioMixes, timestampPreviewSnapshot.sessionWindows]);

  const playableOverlays = useMemo(
    () => selectNativeMediaTimestampPreviewPlayableOverlaysV1({
      overlays,
      currentFrame,
      snapshot: timestampPreviewSnapshot,
    }),
    [currentFrame, overlays, timestampPreviewSnapshot],
  );
  const timestampPreviewPictureGate = useMemo(
    () => selectNativeMediaTimestampPreviewClientGateV1({
      overlays,
      currentFrame,
      snapshot: timestampPreviewSnapshot,
    }),
    [currentFrame, overlays, timestampPreviewSnapshot],
  );
  const timestampPreviewGate = useMemo(() => {
    if (timestampPreviewPictureGate.disposition !== "READY") {
      return Object.freeze({ ...timestampPreviewPictureGate, retryOwner: "PICTURE" as const });
    }
    if (timestampPreviewAudioSnapshot.disposition === "PREPARING") {
      return Object.freeze({
        disposition: "PROBING" as const,
        overlayId: null,
        reason: timestampPreviewAudioSnapshot.reason
          ?? "NATIVE_MEDIA_PREVIEW_AUDIO_PREPARING",
        retryOwner: null,
      });
    }
    if (timestampPreviewAudioSnapshot.disposition === "BLOCKED") {
      return Object.freeze({
        disposition: "BLOCKED" as const,
        overlayId: null,
        reason: timestampPreviewAudioSnapshot.reason
          ?? "NATIVE_MEDIA_PREVIEW_AUDIO_BLOCKED",
        retryOwner: "AUDIO" as const,
      });
    }
    return Object.freeze({
      disposition: "READY" as const,
      overlayId: null,
      reason: null,
      retryOwner: null,
    });
  }, [timestampPreviewAudioSnapshot, timestampPreviewPictureGate]);

  useEffect(() => {
    if (timestampPreviewGate.disposition !== "READY") playerRef.current?.pause();
  }, [playerRef, timestampPreviewGate.disposition]);

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

  // Memoize inputProps to prevent unnecessary Player re-renders
  // This is critical - without memoization, a new object is created on every render,
  // causing the Remotion Player to re-render and restart video playback
  const inputProps = useMemo(
    () => ({
      overlays: playableOverlays,
      setSelectedOverlayId,
      changeOverlay,
      selectedOverlayId,
      durationInFrames,
      fps: FPS,
      width: compositionWidth,
      height: compositionHeight,
      timestampPreviewWindows: timestampPreviewSnapshot.windows,
      timestampPreviewNow: timestampPreviewCoordinator.observedServerNowEpochMs,
    }),
    [
      playableOverlays,
      setSelectedOverlayId,
      changeOverlay,
      selectedOverlayId,
      durationInFrames,
      compositionWidth,
      compositionHeight,
      timestampPreviewCoordinator,
      timestampPreviewSnapshot.windows,
    ]
  );

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
              loop
              durationInFrames={PLAYER_CONFIG.durationInFrames}
              fps={PLAYER_CONFIG.fps}
              inputProps={inputProps}
              errorFallback={() => (
                <div
                  className="flex h-full w-full items-center justify-center bg-zinc-950 p-6 text-center text-sm text-red-200"
                  role="alert"
                >
                  Preview stopped because this frame could not be rendered safely.
                </div>
              )}
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
              playbackRate={playbackRate}
              overflowVisible
              acknowledgeRemotionLicense
            />
            {timestampPreviewGate.disposition !== "READY" ? (
              <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/75 p-5">
                <div
                  className="max-w-sm rounded-xl border border-white/15 bg-zinc-950/95 p-4 text-center text-white shadow-2xl"
                  role={timestampPreviewGate.disposition === "BLOCKED" ? "alert" : "status"}
                  data-editron-timestamp-preview-gate={timestampPreviewGate.disposition}
                >
                  <p className="text-sm font-semibold">
                    {timestampPreviewGate.disposition === "PROBING"
                      ? "Preparing exact-timing preview…"
                      : "Exact-timing preview stopped"}
                  </p>
                  {timestampPreviewGate.disposition === "BLOCKED" ? (
                    <>
                      <p className="mt-2 text-xs leading-5 text-zinc-300">
                        {timestampPreviewMessage(timestampPreviewGate.reason)}
                      </p>
                      {timestampPreviewGate.retryOwner ? (
                        <button
                          type="button"
                          className="mt-3 rounded-md bg-white px-3 py-1.5 text-xs font-medium text-zinc-950 hover:bg-zinc-200"
                          onClick={() => {
                            if (timestampPreviewGate.retryOwner === "AUDIO") {
                              timestampPreviewAudioCoordinator.retry();
                            } else if (timestampPreviewGate.overlayId) {
                              timestampPreviewCoordinator.retry(timestampPreviewGate.overlayId);
                            }
                          }}
                        >
                          Retry exact preview
                        </button>
                      ) : null}
                    </>
                  ) : null}
                </div>
              </div>
            ) : null}
            {timestampPreviewSnapshot.cleanupFailureCount > 0 ? (
              <div
                className="absolute right-2 top-2 z-20 rounded bg-amber-950/90 px-2 py-1 text-[11px] text-amber-100"
                role="status"
              >
                Temporary preview cleanup is incomplete.
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
};

// Wrap with React.memo to prevent re-renders when parent state (like currentFrame) changes
// The VideoPlayer should only re-render when its direct dependencies change
export const VideoPlayer = React.memo(VideoPlayerInner);

function timestampPreviewMessage(reason: string): string {
  switch (reason) {
    case "EXACT_AUDIO_MAPPING_REQUIRED":
      return "This clip has audio, but its exact sample timing is not ready yet.";
    case "LEGACY_TIME_MAP_MIGRATION_REQUIRED":
      return "This clip’s older timing map must be migrated before exact playback.";
    case "RUNTIME_UNAVAILABLE":
    case "SESSION_REQUEST_FAILED":
      return "The private preview service is unavailable. Your timeline was not changed.";
    case "OVERLAY_ASSET_REQUIRED":
      return "This video layer is missing its source asset.";
    case "SESSION_PROJECT_REVISION_REQUIRED":
      return "The saved project revision is still loading, so exact preview is paused.";
    case "PROJECT_REVISION_STALE":
    case "SESSION_CLASSIFICATION_REVISION_MISMATCH":
    case "SESSION_WINDOW_SCOPE_MISMATCH":
      return "The project changed while preview was being prepared. Reload or retry safely.";
    case "NATIVE_MEDIA_PREVIEW_AUDIO_CONTEXT_UNAVAILABLE":
    case "NATIVE_MEDIA_PREVIEW_AUDIO_CONTEXT_NOT_RUNNING":
      return "The browser audio engine could not start exact preview audio.";
    case "NATIVE_MEDIA_PREVIEW_AUDIO_RESPONSE_INVALID":
    case "NATIVE_MEDIA_PREVIEW_AUDIO_RESPONSE_BYTES_INVALID":
    case "NATIVE_MEDIA_PREVIEW_AUDIO_INTEGRITY_MISMATCH":
      return "The private preview audio failed integrity validation and was not played.";
    case "NATIVE_MEDIA_PREVIEW_AUDIO_SCHEDULE_DEADLINE_MISSED":
      return "Preview audio could not be aligned to the current frame, so playback stopped.";
    default:
      return `The clip could not be verified safely (${reason}).`;
  }
}
