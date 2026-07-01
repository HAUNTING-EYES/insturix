import React from "react";
import { Easing, interpolate, useCurrentFrame } from "remotion";
import { Overlay } from "../../types";
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

    default:
      return null;
  }
};

const GeneratedSceneLayerContent: React.FC<{ overlay: any }> = ({ overlay }) => {
  const frame = useCurrentFrame();
  const model = overlay.sceneModel;
  const brand = model?.brand ?? {};
  const elements = Array.isArray(model?.elements) ? model.elements : [];
  const headline = elements.find((element: any) => element.role === "headline");
  const shell = elements.find((element: any) => element.role === "app-shell");
  const panel = elements.find((element: any) => element.role === "panel");
  const metric = elements.find((element: any) => element.role === "metric");
  const cta = elements.find((element: any) => element.role === "cta");
  const caption = model?.captionTracks?.[0]?.text;
  const localFrame = Math.max(0, frame - overlay.from);
  const duration = Math.max(1, overlay.durationInFrames || 1);
  const reveal = interpolate(localFrame, [0, Math.min(36, duration * 0.22)], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
  const drift = interpolate(localFrame, [0, duration], [10, -10], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const accent = brand.accentColor || "#D4A652";
  const background = brand.backgroundColor || "#0B0B0A";
  const surface = brand.surfaceColor || "#171A1F";
  const text = brand.textColor || "#F7F4EA";
  const muted = brand.mutedTextColor || "#B9B2A3";
  const fontFamily = brand.fontFamily || "Plus Jakarta Sans, Inter, sans-serif";
  const items = Array.isArray(shell?.items) && shell.items.length ? shell.items.slice(0, 4) : ["Plan", "Generate", "Review", "Publish"];

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        overflow: "hidden",
        position: "relative",
        background,
        color: text,
        fontFamily,
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage: "linear-gradient(90deg, rgba(255,255,255,0.055) 1px, transparent 1px), linear-gradient(0deg, rgba(255,255,255,0.045) 1px, transparent 1px)",
          backgroundSize: "72px 72px",
          opacity: 0.26,
          transform: `translate3d(${drift}px, ${drift * 0.35}px, 0)`,
        }}
      />
      <div
        style={{
          position: "absolute",
          inset: "7% 8%",
          display: "grid",
          gridTemplateColumns: "0.9fr 1.35fr",
          gap: "5%",
          opacity: reveal,
          transform: `translateY(${(1 - reveal) * 24}px)`,
        }}
      >
        <section style={{ display: "flex", flexDirection: "column", justifyContent: "center", gap: 28 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div style={{ width: 42, height: 42, borderRadius: 10, background: accent, boxShadow: `0 0 34px ${accent}55` }} />
            <div style={{ fontSize: 24, color: muted }}>{brand.name || model?.productName || "SaaS product"}</div>
          </div>
          <h1 style={{ margin: 0, fontSize: 72, lineHeight: 0.96, fontWeight: 800, letterSpacing: 0, maxWidth: 720 }}>
            {headline?.text || model?.title || overlay.content}
          </h1>
          <div style={{ width: 150, height: 4, borderRadius: 999, background: accent }} />
          <p style={{ margin: 0, color: muted, fontSize: 28, lineHeight: 1.32, maxWidth: 640 }}>
            {panel?.text || model?.style?.uiTreatment || "Readable product proof with motion-led UI moments."}
          </p>
        </section>

        <section
          style={{
            alignSelf: "center",
            minHeight: 620,
            borderRadius: 28,
            background: surface,
            border: "1px solid rgba(255,255,255,0.12)",
            boxShadow: "0 28px 80px rgba(0,0,0,0.38)",
            overflow: "hidden",
          }}
        >
          <div style={{ height: 58, display: "flex", alignItems: "center", gap: 10, padding: "0 22px", borderBottom: "1px solid rgba(255,255,255,0.1)" }}>
            {[0, 1, 2].map((dot) => (
              <span key={dot} style={{ width: 12, height: 12, borderRadius: 999, background: dot === 0 ? accent : "rgba(255,255,255,0.22)" }} />
            ))}
            <span style={{ marginLeft: 18, color: muted, fontSize: 18 }}>{shell?.label || "Product workspace"}</span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "210px 1fr", minHeight: 562 }}>
            <aside style={{ padding: 24, borderRight: "1px solid rgba(255,255,255,0.1)" }}>
              {items.map((item: string, index: number) => (
                <div
                  key={item}
                  style={{
                    height: 44,
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    color: index === 1 ? text : muted,
                    fontSize: 17,
                    fontWeight: index === 1 ? 700 : 500,
                  }}
                >
                  <span style={{ width: 9, height: 9, borderRadius: 999, background: index === 1 ? accent : "rgba(255,255,255,0.22)" }} />
                  {item}
                </div>
              ))}
            </aside>
            <main style={{ padding: 30, display: "grid", gridTemplateRows: "120px 1fr 118px", gap: 22 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 18 }}>
                {["Brief", metric?.label || "Mode", "Ready"].map((label, index) => (
                  <div key={label} style={{ borderRadius: 18, background: "rgba(255,255,255,0.055)", border: "1px solid rgba(255,255,255,0.1)", padding: 18 }}>
                    <div style={{ color: muted, fontSize: 15 }}>{label}</div>
                    <div style={{ marginTop: 12, color: index === 1 ? accent : text, fontSize: 28, fontWeight: 800 }}>
                      {index === 1 ? metric?.value || "Product-led" : index === 2 ? "92%" : "Active"}
                    </div>
                  </div>
                ))}
              </div>
              <div style={{ borderRadius: 22, background: "rgba(255,255,255,0.045)", border: `1px solid ${accent}44`, padding: 24 }}>
                <div style={{ height: 18, width: "52%", background: `${accent}88`, borderRadius: 999 }} />
                {[0, 1, 2, 3].map((bar) => (
                  <div key={bar} style={{ marginTop: 28, height: 24, width: `${88 - bar * 11}%`, background: "rgba(255,255,255,0.12)", borderRadius: 999 }} />
                ))}
                <div style={{ marginTop: 34, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18 }}>
                  <div style={{ height: 120, borderRadius: 18, background: `${accent}18`, border: `1px solid ${accent}33` }} />
                  <div style={{ height: 120, borderRadius: 18, background: "rgba(255,255,255,0.055)", border: "1px solid rgba(255,255,255,0.1)" }} />
                </div>
              </div>
              <div style={{ borderRadius: 18, background: `${accent}12`, border: `1px solid ${accent}38`, padding: 20, color: text, fontSize: 24, fontWeight: 700 }}>
                {cta?.text || "Turn brand context into a finished launch asset"}
              </div>
            </main>
          </div>
        </section>
      </div>
      {caption ? (
        <div
          style={{
            position: "absolute",
            left: "14%",
            right: "14%",
            bottom: "5%",
            padding: "16px 24px",
            borderRadius: 18,
            background: "rgba(0,0,0,0.46)",
            border: "1px solid rgba(255,255,255,0.1)",
            color: text,
            fontSize: 28,
            textAlign: "center",
            lineHeight: 1.25,
          }}
        >
          {caption}
        </div>
      ) : null}
    </div>
  );
};
