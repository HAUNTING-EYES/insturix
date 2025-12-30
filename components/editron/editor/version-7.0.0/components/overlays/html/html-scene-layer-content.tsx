import React, { useRef, useEffect, useLayoutEffect } from "react";
import { HtmlSceneOverlay } from "../../../types";
import { useCurrentFrame, useVideoConfig } from "remotion";

interface HtmlSceneLayerContentProps {
  overlay: HtmlSceneOverlay;
}

export const HtmlSceneLayerContent: React.FC<HtmlSceneLayerContentProps> = ({
  overlay,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const shadowRootRef = useRef<ShadowRoot | null>(null);
  
  // Connect to Remotion timeline
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Derived timing values
  // Calculate time relative to the start of this specific clip (if it were trimmed), 
  // but usually overlays are laid out absolutely on the timeline.
  // The overlay.from is where it starts on the timeline.
  const relativeFrame = frame - overlay.from;
  const timeInSeconds = relativeFrame / fps;
  const progress = relativeFrame / overlay.durationInFrames;

  // Update CSS variables for sync
  useLayoutEffect(() => {
    if (containerRef.current) {
      containerRef.current.style.setProperty('--time', `${timeInSeconds}s`);
      containerRef.current.style.setProperty('--frame', `${relativeFrame}`);
      containerRef.current.style.setProperty('--progress', `${progress}`);
      containerRef.current.style.setProperty('--duration', `${overlay.durationInFrames / fps}s`);
    }
  }, [timeInSeconds, relativeFrame, progress, overlay.durationInFrames, fps]);

  const lastPromptRef = useRef<string>("");

  useEffect(() => {
    if (!containerRef.current) return;

    // Initialize shadow root if not exists
    if (!shadowRootRef.current) {
        shadowRootRef.current = containerRef.current.attachShadow({ mode: 'open' });
    }

    const shadow = shadowRootRef.current;

    // Only set content if it's new
    if (shadow.innerHTML === '' || lastPromptRef.current !== overlay.prompt) {
        lastPromptRef.current = overlay.prompt || '';
        
        // Reset
        shadow.innerHTML = '';

        // Inject Styles for Syncing (The Magic Scrubbing CSS)
        const styleReset = document.createElement('style');
        styleReset.textContent = `
          * { box-sizing: border-box; }
          :host { display: block; width: 100%; height: 100%; overflow: hidden; }
          /* Force all animations to pause and be driven by delay */
          * {
            animation-play-state: paused !important;
            animation-delay: calc(var(--time) * -1) !important;
          }
        `;
        shadow.appendChild(styleReset);

        // Content Wrapper
        const wrapper = document.createElement('div');
        wrapper.style.width = '100%';
        wrapper.style.height = '100%';
        wrapper.style.display = 'flex';
        wrapper.style.justifyContent = 'center';
        wrapper.style.alignItems = 'center';
        wrapper.innerHTML = overlay.content;
        
        shadow.appendChild(wrapper);

        // Re-run scripts
        const scripts = wrapper.querySelectorAll('script');
        scripts.forEach((oldScript) => {
          const newScript = document.createElement('script');
          Array.from(oldScript.attributes).forEach(attr => newScript.setAttribute(attr.name, attr.value));
          newScript.textContent = oldScript.textContent;
          oldScript.parentNode?.replaceChild(newScript, oldScript);
        });
    }
  }, [overlay.content, overlay.prompt]);

  return (
    <div 
      ref={containerRef}
      className="w-full h-full"
      style={{
        ...overlay.styles as React.CSSProperties,
      }}
    />
  );
};
