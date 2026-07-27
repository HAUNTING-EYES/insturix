'use client';

import * as React from 'react';
import { X } from 'lucide-react';
import { Mono } from '@/components/primitives';
import { useSidebar } from '../../contexts/sidebar-context';
import { OverlayType } from '../../types';
import { SelectTextOverlay } from '../../components/overlays/text/select-text-overlay';
import { V2SoundBrowse } from './v2-sound-browse';
import { V2CaptionsBrowse } from './v2-captions-browse';
import { V2VideoBrowse } from './v2-video-browse';
import { V2ImageBrowse } from './v2-image-browse';
import { V2AssetsPanel } from './v2-assets-panel';
import { V2SfxBrowse } from './v2-sfx-browse';
import { HtmlScenePanel } from '../../components/overlays/html/html-scene-panel';
import { TransitionBrowserPanel } from '../../components/transitions/transition-browser-panel';
import { LottiePanel } from '../../components/lottie/lottie-panel';

/* ═══ Editron editor v2 · tool panel (244px) ═════════════════════════
   The v6 library/browse column. Renders the REAL v1 panel component for
   the active tool — each panel already switches browse↔details on
   selection internally, so this is a pure re-skin of the container, not
   a fork of any panel's logic. Every panel is props-less and reads
   useEditorContext() itself.

   Keep-mounted pattern (mounted-on-first-visit, hidden via CSS) is copied
   from AppSidebar so chat/search/scroll state survives tool switches.

   TODO(v2-swap): the canonical panel↔type list lives in v1's
   components/sidebar/app-sidebar.tsx (allPanels). This mirrors it to
   avoid touching live v1 during launch; unify into one shared registry
   when v2 replaces v1 and app-sidebar is retired. */

const PANELS: Array<{ type: OverlayType; el: React.ReactNode }> = [
  { type: OverlayType.LOCAL_DIR, el: <V2AssetsPanel /> },
  { type: OverlayType.TEXT, el: <SelectTextOverlay setLocalOverlay={() => {}} /> },
  { type: OverlayType.IMAGE, el: <V2ImageBrowse /> },
  { type: OverlayType.VIDEO, el: <V2VideoBrowse /> },
  { type: OverlayType.CAPTION, el: <V2CaptionsBrowse /> },
  { type: OverlayType.SOUND, el: <V2SoundBrowse /> },
  { type: OverlayType.SFX_LIBRARY, el: <V2SfxBrowse /> },
  { type: OverlayType.TRANSITIONS, el: <TransitionBrowserPanel /> },
  // Selecting a transition tile on the timeline sets activePanel to the
  // singular TRANSITION — map it to the same browser panel (as v1 does).
  { type: OverlayType.TRANSITION, el: <TransitionBrowserPanel /> },
  { type: OverlayType.LOTTIE, el: <LottiePanel /> },
  // No rail entry — reached only by selecting an html-scene overlay.
  { type: OverlayType.HTML_SCENE, el: <HtmlScenePanel /> },
];

const TITLES: Partial<Record<OverlayType, string>> = {
  [OverlayType.LOCAL_DIR]: 'Assets',
  [OverlayType.TEXT]: 'Text',
  [OverlayType.IMAGE]: 'Images',
  [OverlayType.VIDEO]: 'Video',
  [OverlayType.CAPTION]: 'Captions',
  [OverlayType.SOUND]: 'Audio',
  [OverlayType.SFX_LIBRARY]: 'Sound FX',
  [OverlayType.TRANSITIONS]: 'Transitions',
  [OverlayType.TRANSITION]: 'Transitions',
  [OverlayType.LOTTIE]: 'Graphics',
  [OverlayType.HTML_SCENE]: 'Custom Scene',
};

export function V2ToolPanel({ onClose }: { onClose?: () => void }) {
  const { activePanel } = useSidebar();
  const [mounted, setMounted] = React.useState<Set<OverlayType>>(new Set());

  React.useEffect(() => {
    if (activePanel && !mounted.has(activePanel)) {
      setMounted((prev) => new Set([...prev, activePanel]));
    }
  }, [activePanel, mounted]);

  const title = TITLES[activePanel] ?? '';

  return (
    <div className="flex w-[244px] shrink-0 flex-col border-r border-ds-subtle bg-surface-canvas">
      <div className="flex h-[38px] shrink-0 items-center justify-between border-b border-ds-subtle px-3.5">
        <Mono size="9" className="text-ds-secondary">{title}</Mono>
        {onClose && (
          <button type="button" onClick={onClose} title="Close panel (Esc)" className="flex h-6 w-6 items-center justify-center rounded text-ds-muted transition-colors hover:bg-surface-well hover:text-ds-secondary focus-visible:outline-hidden">
            <X size={14} />
          </button>
        )}
      </div>
      <div className="relative min-h-0 flex-1 overflow-y-auto">
        {PANELS.map(({ type, el }) => {
          // Only mount a panel once it has been visited at least once.
          if (!mounted.has(type) && activePanel !== type) return null;
          const isActive = activePanel === type;
          return (
            <div
              key={type}
              className={isActive ? 'h-full' : 'pointer-events-none invisible absolute h-0 overflow-hidden'}
            >
              {el}
            </div>
          );
        })}
      </div>
    </div>
  );
}
