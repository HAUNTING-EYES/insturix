import React, { createContext, useContext, useMemo } from "react";
import { OverlayType, type Overlay } from "../types";
import {
  assertNativeMediaTimestampPreviewHydrationV1,
  createNativeMediaTimestampPreviewHydrationIndexV1,
  type NativeMediaTimestampPreviewHydrationFrameV1,
  type NativeMediaTimestampPreviewHydrationIndexV1,
  type NativeMediaTimestampPreviewHydrationV1,
} from "../remotion/native-media-timestamp-preview-hydration-v1";
import {
  createNativeMediaTimestampPreviewWindowIndexV2,
  type NativeMediaTimestampPreviewWindowFrameV2,
  type NativeMediaTimestampPreviewWindowIndexV2,
  type NativeMediaTimestampPreviewWindowV2,
} from "../remotion/native-media-timestamp-preview-window-v2";

export type RenderMediaMode = "full" | "audio-only";

export type RenderLayerBehavior = "full" | "audio-only" | "omit";

export function resolveRenderLayerBehavior(
  overlayType: OverlayType,
  mediaMode: RenderMediaMode,
): RenderLayerBehavior {
  if (mediaMode !== "full" && mediaMode !== "audio-only") {
    throw new Error(`Unsupported Editron render media mode: ${String(mediaMode)}`);
  }
  if (mediaMode === "full") return "full";
  if (overlayType === OverlayType.VIDEO || overlayType === OverlayType.SOUND) {
    return "audio-only";
  }
  return "omit";
}

/**
 * Context for rendering state and cross-track overlay awareness.
 *
 * - isRendering: true during server-side render (Remotion renderMedia),
 *   false in the interactive editor (Remotion Player).
 * - overlays: full overlay array, needed by sound layers for audio ducking
 *   (BGM needs to know where voiceover overlays are to duck volume).
 */
interface RenderingContextValue {
  isRendering: boolean;
  mediaMode: RenderMediaMode;
  overlays: Overlay[];
  timestampPreviewIndex: NativeMediaTimestampPreviewHydrationIndexV1;
  timestampPreviewHydrationsByOverlay: ReadonlyMap<string, NativeMediaTimestampPreviewHydrationV1>;
  timestampPreviewWindowIndex: NativeMediaTimestampPreviewWindowIndexV2;
}

const RenderingContext = createContext<RenderingContextValue>({
  isRendering: false,
  mediaMode: "full",
  overlays: [],
  timestampPreviewIndex: createNativeMediaTimestampPreviewHydrationIndexV1(),
  timestampPreviewHydrationsByOverlay: new Map(),
  timestampPreviewWindowIndex: createNativeMediaTimestampPreviewWindowIndexV2(),
});

export const RenderingProvider: React.FC<{
  isRendering: boolean;
  mediaMode?: RenderMediaMode;
  overlays?: Overlay[];
  timestampPreviewHydrations?: readonly NativeMediaTimestampPreviewHydrationV1[];
  timestampPreviewWindows?: readonly NativeMediaTimestampPreviewWindowV2[];
  children: React.ReactNode;
}> = ({
  isRendering,
  mediaMode = "full",
  overlays = [],
  timestampPreviewHydrations = [],
  timestampPreviewWindows = [],
  children,
}) => {
  const timestampPreviewState = useMemo(
    () => {
      const index = createNativeMediaTimestampPreviewHydrationIndexV1(
        timestampPreviewHydrations,
      );
      const byOverlay = new Map<string, NativeMediaTimestampPreviewHydrationV1>();
      for (const candidate of timestampPreviewHydrations) {
        const hydration = assertNativeMediaTimestampPreviewHydrationV1(candidate);
        byOverlay.set(hydration.overlayId, hydration);
      }
      const windowIndex = createNativeMediaTimestampPreviewWindowIndexV2(
        timestampPreviewWindows,
      );
      for (const overlayId of byOverlay.keys()) {
        if (windowIndex.hasOverlay(overlayId)) {
          throw new Error('NATIVE_MEDIA_PREVIEW_VERSION_CONFLICT');
        }
      }
      return Object.freeze({ index, byOverlay, windowIndex });
    },
    [timestampPreviewHydrations, timestampPreviewWindows],
  );
  return (
    <RenderingContext.Provider value={{
      isRendering,
      mediaMode,
      overlays,
      timestampPreviewIndex: timestampPreviewState.index,
      timestampPreviewHydrationsByOverlay: timestampPreviewState.byOverlay,
      timestampPreviewWindowIndex: timestampPreviewState.windowIndex,
    }}>
      {children}
    </RenderingContext.Provider>
  );
};

/** Returns `true` when inside a server-side render, `false` in the editor. */
export const useIsRendering = (): boolean => useContext(RenderingContext).isRendering;

/** Returns which media graph the current render must evaluate. */
export const useRenderMediaMode = (): RenderMediaMode =>
  useContext(RenderingContext).mediaMode;

/** Returns all overlays in the project (for cross-track awareness like audio ducking). */
export const useAllOverlays = (): Overlay[] => useContext(RenderingContext).overlays;

export type NativeMediaTimestampPreviewFrameRequestV1 = Readonly<{
  overlayId: string | number,
  overlayFromFrame: number;
  overlayDurationInFrames: number;
  localFrame: number;
}>;

export type NativeMediaTimestampPreviewSelectionV1 = Readonly<{
  frame: NativeMediaTimestampPreviewHydrationFrameV1 | NativeMediaTimestampPreviewWindowFrameV2;
  audioOwnership:
    | NativeMediaTimestampPreviewHydrationV1['audioOwnership']
    | NativeMediaTimestampPreviewWindowV2['audioOwnership'];
}>;

/** Returns one exact picture only when its receipt scope still matches the live overlay. */
export const useNativeMediaTimestampPreviewFrame = (
  request: NativeMediaTimestampPreviewFrameRequestV1,
): NativeMediaTimestampPreviewSelectionV1 | null => {
  const context = useContext(RenderingContext);
  const hasHydration = context.timestampPreviewIndex.hasOverlay(request.overlayId);
  const hasWindow = context.timestampPreviewWindowIndex.hasOverlay(request.overlayId);
  if (!hasHydration && !hasWindow) return null;
  if (hasHydration && hasWindow) throw new Error('NATIVE_MEDIA_PREVIEW_VERSION_CONFLICT');

  const expectedProjectFrame = request.overlayFromFrame + request.localFrame;
  if (!Number.isSafeInteger(request.overlayFromFrame) || request.overlayFromFrame < 0
    || !Number.isSafeInteger(request.overlayDurationInFrames)
    || request.overlayDurationInFrames < 1
    || !Number.isSafeInteger(request.localFrame) || request.localFrame < 0
    || request.localFrame >= request.overlayDurationInFrames
    || !Number.isSafeInteger(expectedProjectFrame)) {
    throw new Error('NATIVE_MEDIA_PREVIEW_HYDRATION_OVERLAY_SCOPE_MISMATCH');
  }

  if (hasHydration) {
    const hydration = context.timestampPreviewHydrationsByOverlay.get(String(request.overlayId));
    if (!hydration) {
      throw new Error('NATIVE_MEDIA_PREVIEW_HYDRATION_INDEX_STATE_INVALID');
    }
    if (hydration.overlayFromFrame !== request.overlayFromFrame
      || hydration.overlayDurationInFrames !== request.overlayDurationInFrames) {
      throw new Error('NATIVE_MEDIA_PREVIEW_HYDRATION_OVERLAY_SCOPE_MISMATCH');
    }
    const frame = context.timestampPreviewIndex.frameFor(request.overlayId, request.localFrame);
    if (!frame || frame.projectFrame !== expectedProjectFrame) {
      throw new Error('NATIVE_MEDIA_PREVIEW_HYDRATION_FRAME_MISSING');
    }
    return Object.freeze({ frame, audioOwnership: hydration.audioOwnership });
  }

  const window = context.timestampPreviewWindowIndex.windowFor(
    request.overlayId,
    request.localFrame,
  );
  if (!window) throw new Error('NATIVE_MEDIA_PREVIEW_WINDOW_FRAME_NOT_LOADED');
  if (window.overlayFromFrame !== request.overlayFromFrame
    || window.overlayDurationInFrames !== request.overlayDurationInFrames) {
    throw new Error('NATIVE_MEDIA_PREVIEW_WINDOW_OVERLAY_SCOPE_MISMATCH');
  }
  const frame = context.timestampPreviewWindowIndex.frameFor(
    request.overlayId,
    request.localFrame,
  );
  if (!frame || frame.projectFrame !== expectedProjectFrame) {
    throw new Error('NATIVE_MEDIA_PREVIEW_WINDOW_FRAME_MISSING');
  }
  return Object.freeze({ frame, audioOwnership: window.audioOwnership });
};
