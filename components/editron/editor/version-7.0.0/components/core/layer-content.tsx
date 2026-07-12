import React, { useEffect, useMemo } from "react";
import { Img, prefetch, useCurrentFrame } from "remotion";
import { MgSequenceOverlay, Overlay } from "../../types";
import { TextLayerContent } from "../overlays/text/text-layer-content";
import { OverlayType } from "../../types";
import { CaptionLayerContent } from "../overlays/captions/caption-layer-content";
import { VideoLayerContent } from "../overlays/video/video-layer-content";
import { ImageLayerContent } from "../overlays/images/image-layer-content";
import { SoundLayerContent } from "../overlays/captions/sound-layer-content";
import { StickerLayerContent } from "../overlays/stickers/sticker-layer-content";
import { HtmlSceneLayerContent } from "../overlays/html/html-scene-layer-content";
import { TransitionLayerContent } from "../overlays/transitions/transition-layer-content";
import { MotionGraphicLayerContent } from "../overlays/motion-graphic/motion-graphic-layer-content";
import { GeneratedSceneLayerContent } from "./generated-scene-layer-content";
import {
  sequenceFrameIndex,
  sequenceFrameUrls,
} from "@/lib/editron/motion-graphics/codegen/render/sequence-playback";

const MgSequenceLayerContent: React.FC<{ overlay: MgSequenceOverlay }> = ({ overlay }) => {
  const localFrame = useCurrentFrame();
  const sequence = overlay.sequence;
  const address = useMemo(() => {
    if (!sequence) {
      throw new Error(`[MgSequenceLayer] Overlay ${overlay.id} (${overlay.assetId}) is missing hydrated sequence playback data`);
    }
    if (sequence.transparent !== true || sequence.frameFormat !== 'webp') {
      throw new Error(`[MgSequenceLayer] Overlay ${overlay.id} has an unsupported sequence format`);
    }
    return {
      sequenceId: sequence.sequenceId,
      frameCount: sequence.frameCount,
      cdnBaseUrl: sequence.cdnBaseUrl,
    };
  }, [overlay.assetId, overlay.id, sequence]);
  const urls = useMemo(() => sequenceFrameUrls(address), [address]);

  useEffect(() => {
    const handles = urls.flatMap((url) => {
      try {
        return [prefetch(url, { method: 'blob-url' })];
      } catch (error) {
        console.warn(`[MgSequenceLayer] Prefetch failed for ${overlay.assetId}:`, error);
        return [];
      }
    });
    return () => handles.forEach((handle) => handle.free());
  }, [overlay.assetId, urls]);

  const frameIndex = sequenceFrameIndex(localFrame, address.frameCount);
  return <Img src={urls[frameIndex]} style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }} />;
};

/**
 * Props for the LayerContent component
 * @interface LayerContentProps
 * @property {Overlay} overlay - The overlay object containing type and content information
 */
interface LayerContentProps {
  overlay: Overlay;
  baseUrl?: string;
}

/**
 * LayerContent Component
 *
 * @component
 * @description
 * A component that renders different types of content layers in the video editor.
 * It acts as a switch component that determines which specific layer component
 * to render based on the overlay type.
 *
 * Supported overlay types:
 * - VIDEO: Renders video content with VideoLayerContent
 * - TEXT: Renders text overlays with TextLayerContent
 * - SHAPE: Renders colored shapes
 * - IMAGE: Renders images with ImageLayerContent
 * - CAPTION: Renders captions with CaptionLayerContent
 * - SOUND: Renders audio elements using Remotion's Audio component
 *
 * Each layer type maintains consistent sizing through commonStyle,
 * with specific customizations applied as needed.
 *
 * @example
 * ```tsx
 * <LayerContent overlay={{
 *   type: OverlayType.TEXT,
 *   content: "Hello World",
 *   // ... other overlay properties
 * }} />
 * ```
 */
export const LayerContent: React.FC<LayerContentProps> = ({
  overlay,
  baseUrl,
}) => {
  /**
   * Common styling applied to all layer types
   * Ensures consistent dimensions across different content types
   */
  const commonStyle: React.CSSProperties = {
    width: "100%",
    height: "100%",
  };

  switch (overlay.type) {
    case OverlayType.VIDEO:
      return (
        <div style={{ ...commonStyle }}>
          <VideoLayerContent overlay={overlay} baseUrl={baseUrl} />
        </div>
      );

    case OverlayType.TEXT:
      return (
        <div style={{ ...commonStyle }}>
          <TextLayerContent overlay={overlay} />
        </div>
      );

    case OverlayType.IMAGE:
      return (
        <div style={{ ...commonStyle }}>
          <ImageLayerContent overlay={overlay} baseUrl={baseUrl} />
        </div>
      );

    case OverlayType.CAPTION:
      return (
        <div
          style={{
            ...commonStyle,
            position: "relative",
            overflow: "visible",
            display: "flex",
          }}
        >
          <CaptionLayerContent overlay={overlay} />
        </div>
      );

    case OverlayType.STICKER:
      return (
        <div style={{ ...commonStyle }}>
          <StickerLayerContent overlay={overlay} isSelected={false} />
        </div>
      );

    case OverlayType.HTML_SCENE:
    case OverlayType.HTML_STICKER:
      return (
        <div style={{ ...commonStyle }}>
          <HtmlSceneLayerContent overlay={overlay} />
        </div>
      );


    case OverlayType.GENERATED_SCENE:
      return (
        <div style={{ ...commonStyle }}>
          <GeneratedSceneLayerContent overlay={overlay as any} />
        </div>
      );
    case OverlayType.SOUND:
      return <SoundLayerContent overlay={overlay} baseUrl={baseUrl} />;

    case OverlayType.TRANSITION:
      return (
        <div style={{ ...commonStyle }}>
          <TransitionLayerContent overlay={overlay as any} />
        </div>
      );

    case OverlayType.MOTION_GRAPHIC:
      return (
        <div style={{ ...commonStyle }}>
          <MotionGraphicLayerContent overlay={overlay as any} />
        </div>
      );

    case OverlayType.MG_SEQUENCE:
      return (
        <div style={{ ...commonStyle }}>
          <MgSequenceLayerContent overlay={overlay} />
        </div>
      );
    default:
      return null;
  }
};
