import React, { useRef, useEffect, useLayoutEffect } from "react";
import { HtmlSceneOverlay, HtmlStickerOverlay } from "../../../types";
import { useCurrentFrame, useVideoConfig } from "remotion";

interface HtmlSceneLayerContentProps {
  overlay: HtmlSceneOverlay | HtmlStickerOverlay;
}

export const HtmlSceneLayerContent: React.FC<HtmlSceneLayerContentProps> = ({
  overlay,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const shadowRootRef = useRef<ShadowRoot | null>(null);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  
  // Connect to Remotion timeline
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Derived timing values
  const relativeFrame = frame - overlay.from;
  const timeInSeconds = relativeFrame / fps;
  const progress = relativeFrame / overlay.durationInFrames;

  // Update CSS variables for sync - set on BOTH host and wrapper
  useLayoutEffect(() => {
    // Set on host element
    if (containerRef.current) {
      containerRef.current.style.setProperty('--time', `${timeInSeconds}s`);
      containerRef.current.style.setProperty('--frame', `${relativeFrame}`);
      containerRef.current.style.setProperty('--progress', `${progress}`);
      containerRef.current.style.setProperty('--duration', `${overlay.durationInFrames / fps}s`);
    }
    
    // CRITICAL: Also set on wrapper INSIDE shadow DOM for proper inheritance
    if (wrapperRef.current) {
      wrapperRef.current.style.setProperty('--time', `${timeInSeconds}s`);
      wrapperRef.current.style.setProperty('--frame', `${relativeFrame}`);
      wrapperRef.current.style.setProperty('--progress', `${progress}`);
      wrapperRef.current.style.setProperty('--duration', `${overlay.durationInFrames / fps}s`);
    }
    
    // Debug logging for first few frames
    if (relativeFrame >= 0 && relativeFrame <= 3) {
      console.log(`[HTML-SCENE] Frame ${frame}, relativeFrame ${relativeFrame}, --time: ${timeInSeconds}s`);
    }
  }, [timeInSeconds, relativeFrame, progress, overlay.durationInFrames, fps, frame]);

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
          :host { 
            display: block; 
            width: 100%; 
            height: 100%; 
            overflow: hidden;
          }
          
          /* 
           * Pause all animations so they can be controlled by negative delay (scrubbing).
           * Individual elements should set their own animation-delay using:
           *   animation-delay: calc(var(--time) * -1 + Xs);
           */
          * {
            animation-play-state: paused !important;
          }
          /* Fallback for elements that don't specify their own delay - sync to current time */
          *:not([data-start]) {
            animation-delay: calc(var(--time, 0s) * -1) !important;
          }
        `;
        shadow.appendChild(styleReset);

        // Content Wrapper - CSS vars will be set on this element for shadow DOM access
        const wrapper = document.createElement('div');
        wrapper.style.cssText = `
          width: 100%;
          height: 100%;
          position: relative;
          overflow: hidden;
        `;
        wrapper.innerHTML = overlay.content;
        
        // Store reference so we can update CSS vars on it
        wrapperRef.current = wrapper;
        
        shadow.appendChild(wrapper);

        // Re-run scripts
        const scripts = wrapper.querySelectorAll('script');
        scripts.forEach((oldScript) => {
          const newScript = document.createElement('script');
          Array.from(oldScript.attributes).forEach(attr => newScript.setAttribute(attr.name, attr.value));
          newScript.textContent = oldScript.textContent;
          oldScript.parentNode?.replaceChild(newScript, oldScript);
        });
        
        console.log('[HTML-SCENE] Initialized shadow DOM content for overlay', overlay.id);
    }
  }, [overlay.content, overlay.prompt, overlay.id]);

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
