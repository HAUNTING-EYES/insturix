'use client';

import React, { useEffect, useState } from 'react';
import { useHotkeys } from 'react-hotkeys-hook';
import { useEditorContext } from '../contexts/editor-context';
import { DISABLE_MOBILE_LAYOUT } from '../constants';
import { V2Timeline } from './timeline/v2-timeline';
import { V2Header } from './shell/v2-header';
import { V2Canvas } from './shell/v2-canvas';
import { V2Transport } from './shell/v2-transport';
import { V2ToolRail } from './shell/v2-tool-rail';
import { V2ToolPanel } from './shell/v2-tool-panel';
import { V2PropsPanel } from './shell/v2-props-panel';
import { V2AiPanel } from './ai/v2-ai-panel';
import { V2Modals, type V2ModalKind } from './modals/v2-modals';

/* ═══ Editron editor · v2 shell ═══════════════════════════════════════
   The redesigned editor (editron-editor-v6.jsx) over the real providers —
   a re-skin, no logic forked. Header · tool-rail · tool-panel ·
   canvas+transport · props · AI panel · timeline, plus render / recovery /
   quality / mobile modals. Reproduces the real Editor's viewport effects,
   hotkeys and context wiring. v1 stays the source of truth; this mounts at
   /v2 until the founder swaps it in. */

export function V2Editor() {
  const [isMobile, setIsMobile] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [modal, setModal] = useState<V2ModalKind>(null);
  const [toolOpen, setToolOpen] = useState(true);
  const [propsOpen, setPropsOpen] = useState(true);

  // Mobile detect (mirrors Editor).
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  // Viewport height var + lock scroll (mirrors Editor — required or the page scrolls / mis-sizes).
  useEffect(() => {
    const onResize = () => document.documentElement.style.setProperty('--vh', `${window.innerHeight * 0.01}px`);
    onResize();
    window.addEventListener('resize', onResize);
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('resize', onResize);
      document.body.style.overflow = '';
      document.documentElement.style.overflow = '';
    };
  }, []);

  const {
    overlays, selectedOverlayId, setSelectedOverlayId, currentFrame, playerRef,
    togglePlayPause, handleOverlayChange, handleTimelineClick, seekTo,
    deleteOverlay, duplicateOverlay, splitOverlay, durationInFrames, setOverlays, projectId, state,
  } = useEditorContext();

  // Surface the render modal automatically once a render leaves 'init'.
  useEffect(() => {
    const s = (state as { status?: string } | undefined)?.status;
    if (s && s !== 'init') setModal((m) => m ?? 'render');
  }, [state]);

  useHotkeys('space', (e) => {
    const t = e.target as HTMLElement | null;
    const tag = t?.tagName?.toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select' || (t as HTMLElement | null)?.isContentEditable) return;
    e.preventDefault();
    togglePlayPause();
  }, { keydown: true, preventDefault: true });

  useHotkeys('backspace, delete', (e) => {
    const t = e.target as HTMLElement | null;
    const tag = t?.tagName?.toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select' || (t as HTMLElement | null)?.isContentEditable) return;
    if (selectedOverlayId === null) return;
    e.preventDefault();
    deleteOverlay(selectedOverlayId);
    setSelectedOverlayId(null);
  }, { keydown: true, preventDefault: true });

  // Esc: close an open modal first, else collapse the side panels to focus
  // on the video. Panels reopen from the tool rail / on selecting a clip / AI.
  useHotkeys('escape', () => {
    if (modal) { setModal(null); return; }
    setToolOpen(false);
    setPropsOpen(false);
    setAiOpen(false);
  }, { enableOnFormTags: false }, [modal]);

  // Re-open the properties panel whenever a clip is selected.
  useEffect(() => {
    if (selectedOverlayId !== null) setPropsOpen(true);
  }, [selectedOverlayId]);

  if (isMobile && DISABLE_MOBILE_LAYOUT) {
    return (
      <div className="flex h-screen items-center justify-center bg-surface-canvas p-6 text-center">
        <div>
          <h2 className="mb-3 text-[18px] font-bold text-ds-primary">Editron</h2>
          <p className="text-sm text-ds-muted">Editron is a full-screen desktop experience. Mobile is coming. 👀</p>
        </div>
      </div>
    );
  }

  return (
    <div
      className="flex flex-col overflow-hidden bg-surface-canvas font-sans text-ds-primary"
      style={{ height: 'calc(var(--vh, 1vh) * 100)', maxHeight: '-webkit-fill-available' }}
    >
      <V2Header
        projectName={projectId ?? 'Project'}
        aiOpen={aiOpen}
        onToggleAi={() => setAiOpen((o) => !o)}
        onOpenRecovery={() => setModal('recovery')}
        onOpenQuality={() => setModal('quality')}
        onOpenMobilePreview={() => setModal('mobile')}
      />

      <div className="flex min-h-0 flex-1">
        <V2ToolRail aiOpen={aiOpen} onToggleAi={() => setAiOpen((o) => !o)} onOpenTool={() => setToolOpen(true)} />
        {toolOpen && <V2ToolPanel onClose={() => setToolOpen(false)} />}

        <div className="flex min-w-0 flex-1 flex-col">
          <V2Canvas />
          <V2Transport />
        </div>

        {propsOpen && <V2PropsPanel onClose={() => setPropsOpen(false)} />}
        {aiOpen && <V2AiPanel onClose={() => setAiOpen(false)} />}
      </div>

      {/* Phase 4: v2-skinned timeline (re-skins the real Timeline's chrome;
          reuses the same drag/trim/snap/zoom hooks + TimelineGrid engine). */}
      <V2Timeline
        currentFrame={currentFrame}
        overlays={overlays}
        durationInFrames={durationInFrames}
        selectedOverlayId={selectedOverlayId}
        setSelectedOverlayId={setSelectedOverlayId}
        onOverlayChange={handleOverlayChange}
        onOverlayDelete={deleteOverlay}
        onOverlayDuplicate={duplicateOverlay}
        onSplitOverlay={splitOverlay}
        setCurrentFrame={seekTo}
        setOverlays={setOverlays}
        onTimelineClick={handleTimelineClick}
        playerRef={playerRef}
      />

      <V2Modals modal={modal} onClose={() => setModal(null)} />
    </div>
  );
}
