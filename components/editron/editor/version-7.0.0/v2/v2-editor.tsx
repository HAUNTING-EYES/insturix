'use client';

import React, { useEffect, useState } from 'react';
import { useHotkeys } from 'react-hotkeys-hook';
import { Mono } from '@/components/primitives';
import { useEditorContext } from '../contexts/editor-context';
import { DISABLE_MOBILE_LAYOUT } from '../constants';
import Timeline from '../components/timeline/timeline';
import { V2Header } from './shell/v2-header';
import { V2Canvas } from './shell/v2-canvas';
import { V2Transport } from './shell/v2-transport';

/* ═══ Editron editor · v2 shell ═══════════════════════════════════════
   The redesigned editor (editron-editor-v6.jsx) over the real providers —
   a re-skin, no logic forked. Reproduces the real Editor's viewport effects
   + hotkeys + context wiring; lays out the v6 grid (header / tool-rail ·
   tool-panel · canvas+transport · props · ai / timeline).

   PHASE 2 (this commit): header + canvas (real player) + transport are the
   real v6 chrome. The tool-rail, tool/props/ai panels are labelled
   placeholders (Phase 3), and the timeline is the real <Timeline/> until
   Phase 4 re-skins it. */

function Placeholder({ label, className }: { label: string; className?: string }) {
  return (
    <div className={`flex shrink-0 flex-col items-center justify-center gap-2 border-ds-subtle bg-surface-canvas ${className ?? ''}`}>
      <Mono size="9" className="text-ds-dim">{label}</Mono>
      <Mono size="8" className="text-ds-faint">Phase 3</Mono>
    </div>
  );
}

export function V2Editor() {
  const [isMobile, setIsMobile] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);

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
    deleteOverlay, duplicateOverlay, splitOverlay, durationInFrames, setOverlays, projectId,
  } = useEditorContext();

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
        onOpenRecovery={() => { /* TODO(Phase 5): recovery modal */ }}
        onOpenQuality={() => { /* TODO(Phase 5): quality modal */ }}
        onOpenMobilePreview={() => { /* TODO(Phase 5): mobile preview */ }}
      />

      <div className="flex min-h-0 flex-1">
        <Placeholder label="Tools" className="w-[72px] border-r" />
        <Placeholder label="Tool panel" className="w-[244px] border-r" />

        <div className="flex min-w-0 flex-1 flex-col">
          <V2Canvas />
          <V2Transport />
        </div>

        <Placeholder label="Properties" className="w-[264px] border-l" />
        {aiOpen && <Placeholder label="Editron AI" className="w-[300px] border-l" />}
      </div>

      {/* Real timeline until Phase 4 re-skins it. */}
      <Timeline
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
    </div>
  );
}
