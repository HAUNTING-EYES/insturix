import React, { useRef, useEffect } from "react";
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
  // NOTE: Using useEffect instead of useLayoutEffect for SSR/Lambda compatibility
  // useLayoutEffect doesn't fire in SSR, causing CSS variables to not be set
  useEffect(() => {
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
      
      // FANCY CAPTION VISIBILITY: Control word visibility based on current time
      // This replaces the old CSS animation scrubbing approach
      const currentMs = timeInSeconds * 1000;
      const words = wrapperRef.current.querySelectorAll('.word[data-start]');
      
      words.forEach((word) => {
        const el = word as HTMLElement;
        const startMs = parseInt(el.dataset.start || '0', 10);
        const endMs = parseInt(el.dataset.end || '0', 10);
        
        // Word is visible when current time is within its range
        const isVisible = currentMs >= startMs && currentMs <= endMs;
        
        // Smooth entry/exit with transform
        if (isVisible) {
          el.style.opacity = '1';
          el.style.transform = 'scale(1) translateY(0)';
        } else if (currentMs < startMs) {
          // Before word appears - hidden and slightly down/scaled
          el.style.opacity = '0';
          el.style.transform = 'scale(0.85) translateY(8px)';
        } else {
          // After word disappears - hidden and slightly up/scaled down
          el.style.opacity = '0';
          el.style.transform = 'scale(0.9) translateY(-5px)';
        }
      });
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

        // Inject base styles
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
           * For regular HTML scenes: pause animations and sync via --time variable.
           * For fancy captions: React controls visibility directly via inline styles.
           */
          *:not(.word[data-start]) {
            animation-play-state: paused !important;
            animation-delay: calc(var(--time, 0s) * -1) !important;
          }
          
          /* Smooth transitions for React-controlled word visibility */
          .word[data-start] {
            transition: opacity 0.15s ease-out, transform 0.15s ease-out;
          }
        `;
        shadow.appendChild(styleReset);

        // Content Wrapper - CSS vars will be set on this element for shadow DOM access
        // CRITICAL: Set initial CSS vars inline to ensure they're available before first paint
        // In Lambda SSR, useEffect may fire after the screenshot is taken
        const wrapper = document.createElement('div');
        wrapper.style.cssText = `
          width: 100%;
          height: 100%;
          position: relative;
          overflow: hidden;
          --time: ${timeInSeconds}s;
          --frame: ${relativeFrame};
          --progress: ${progress};
          --duration: ${overlay.durationInFrames / fps}s;
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
