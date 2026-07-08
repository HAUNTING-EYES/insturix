'use client';

import React, { useCallback, useMemo, memo, useRef, useState, useEffect } from 'react';
import { CaptionOverlay, Overlay, OverlayType } from '../../types';
import { useWaveformProcessor } from '../../hooks/use-waveform-processor';
import WaveformVisualizer from '../../components/overlays/sounds/waveform-visualizer';
import { TimelineKeyframes } from '../../components/timeline/timeline-keyframes';
import { TimelineKeyframeDiamonds } from '../../components/timeline/timeline-keyframe-diamonds';
import { useSidebar } from '../../contexts/sidebar-context';
import { useEditorContext } from '../../contexts/editor-context';
import { TimelineItemHandle } from '../../components/timeline/timeline-item-handle';
import { TimelineItemContextMenu } from '../../components/timeline/timeline-item-context-menu';
import TimelineCaptionBlocks from '../../components/timeline/timeline-caption-blocks';
import { cn } from '@/lib/utils';
import { useKeyframeContext } from '../../contexts/keyframe-context';

/* ═══ Editron editor v2 · timeline clip ══════════════════════════════
   The v6-styled clip. This is a presentational twin of the real
   components/timeline/timeline-item.tsx — SAME drag/trim/touch wiring,
   SAME real sub-components (label, handles, keyframe diamonds, waveform,
   caption blocks, context menu, L-cut/J-cut audio handles). Only the clip
   FILL + selection border change: warm-dark tokens with type expressed by
   subtle tint (gold=text, green=audio, gold stripes=transition) instead of
   v1's purple/emerald/cyan rainbow. No drag math or logic forked. */

interface WaveformData {
  peaks: number[];
  length: number;
}

export interface V2TimelineItemProps {
  item: Overlay;
  isDragging: boolean;
  draggedItem: Overlay | null;
  selectedItem: { id: number } | null;
  setSelectedItem: (item: { id: number }) => void;
  handleMouseDown: (action: 'move' | 'resize-start' | 'resize-end', e: React.MouseEvent<HTMLDivElement>) => void;
  handleTouchStart: (action: 'move' | 'resize-start' | 'resize-end', e: React.TouchEvent<HTMLDivElement>) => void;
  totalDuration: number;
  onDeleteItem: (id: number) => void;
  onDuplicateItem: (id: number) => void;
  onSplitItem: (id: number) => void;
  onHover: (itemId: number, position: number) => void;
  onContextMenuChange: (open: boolean) => void;
  waveformData?: WaveformData;
  currentFrame?: number;
  zoomScale: number;
  onAssetLoadingChange?: (overlayId: number, isLoading: boolean) => void;
  livePushOffsetPercent?: number;
}

/** Warm-dark clip fill + text, type by subtle tint (not a rainbow). */
function v2Fill(type: OverlayType): string {
  switch (type) {
    case OverlayType.TEXT:
      return 'bg-gold/[0.13] hover:bg-gold/20 text-gold';
    case OverlayType.SOUND:
    case OverlayType.SFX_LIBRARY:
      return 'bg-status-success/10 hover:bg-status-success/20 text-status-success';
    case OverlayType.TRANSITION:
      return 'text-gold'; // striped background applied via style below
    default:
      return 'bg-surface-well hover:bg-surface-deeper text-ds-secondary';
  }
}

/** Tiny 2-char type glyph (v6 shows this, not the full type name). */
const GLYPH: Partial<Record<OverlayType, string>> = {
  [OverlayType.TEXT]: 'Tx', [OverlayType.VIDEO]: 'Vd', [OverlayType.IMAGE]: 'Im',
  [OverlayType.CAPTION]: 'Cc', [OverlayType.SOUND]: 'Au', [OverlayType.SFX_LIBRARY]: 'Fx',
  [OverlayType.STICKER]: 'St', [OverlayType.SHAPE]: 'Sh', [OverlayType.HTML_SCENE]: 'Ht',
  [OverlayType.MOTION_GRAPHIC]: 'Mg', [OverlayType.GENERATED_SCENE]: 'Gn',
  [OverlayType.TRANSITION]: 'Tr', [OverlayType.LOTTIE]: 'Lt', [OverlayType.TEMPLATE]: 'Tm',
};

/** A MEANINGFUL clip name only — never the redundant type text. Text shows
    its content, media shows its filename; type-only clips (motion-graphic,
    generated-scene, transition, shape…) show nothing but the glyph. */
function clipName(item: Overlay): string {
  if (item.type === OverlayType.TEXT) {
    const c = (item as { content?: unknown }).content;
    return typeof c === 'string' ? c : '';
  }
  if (item.type === OverlayType.CAPTION) return '';
  const src = (item as { src?: string }).src;
  if (src) return (src.split('/').pop() || '').split('?')[0];
  return '';
}

const V2TimelineItem: React.FC<V2TimelineItemProps> = ({
  item,
  isDragging,
  draggedItem,
  selectedItem,
  setSelectedItem,
  handleMouseDown,
  handleTouchStart,
  totalDuration,
  onDeleteItem,
  onDuplicateItem,
  onSplitItem,
  onHover,
  onContextMenuChange,
  currentFrame,
  zoomScale,
  onAssetLoadingChange,
  livePushOffsetPercent = 0,
}) => {
  const waveformData = useWaveformProcessor(
    item.type === OverlayType.SOUND ? item.src : undefined,
    item.type === OverlayType.SOUND ? item.startFromSound : undefined,
    item.durationInFrames,
  );

  const isSelected = selectedItem?.id === item.id;
  const itemRef = useRef<HTMLDivElement>(null);
  const { setActivePanel, setIsOpen } = useSidebar();
  const { changeOverlay: editorChangeOverlay } = useEditorContext();
  const keyframeContext = useKeyframeContext();

  const [touchStartTime, setTouchStartTime] = useState<number | null>(null);
  const [touchStartPosition, setTouchStartPosition] = useState<{ x: number; y: number } | null>(null);
  const [isTouching, setIsTouching] = useState(false);
  const [clipW, setClipW] = useState(0);
  const touchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const LONG_PRESS_DURATION = 500;
  const TOUCH_MOVEMENT_THRESHOLD = 10;

  const handleItemInteraction = (e: React.MouseEvent | React.TouchEvent, action: 'click' | 'mousedown' | 'touchstart') => {
    e.stopPropagation();
    if (action === 'click') {
      setSelectedItem({ id: item.id });
    } else if (action === 'mousedown') {
      if (!isSelected) setSelectedItem({ id: item.id });
      handleMouseDown('move', e as React.MouseEvent<HTMLDivElement>);
    } else if (action === 'touchstart') {
      const touchEvent = e as React.TouchEvent<HTMLDivElement>;
      const touch = touchEvent.touches[0];
      if (!isSelected) setSelectedItem({ id: item.id });
      setTouchStartTime(Date.now());
      setTouchStartPosition({ x: touch.clientX, y: touch.clientY });
      setIsTouching(true);
      if (touchTimeoutRef.current) clearTimeout(touchTimeoutRef.current);
      touchTimeoutRef.current = setTimeout(() => {
        if (isTouching) setIsTouching(false);
      }, LONG_PRESS_DURATION);
    }
  };

  const handleTouchMove = useCallback(
    (e: React.TouchEvent<HTMLDivElement>) => {
      if (!touchStartPosition) return;
      const touch = e.touches[0];
      const moveX = Math.abs(touch.clientX - touchStartPosition.x);
      const moveY = Math.abs(touch.clientY - touchStartPosition.y);
      if (moveX > TOUCH_MOVEMENT_THRESHOLD || moveY > TOUCH_MOVEMENT_THRESHOLD) {
        if (touchTimeoutRef.current) {
          clearTimeout(touchTimeoutRef.current);
          touchTimeoutRef.current = null;
        }
        handleTouchStart('move', e);
        setTouchStartTime(null);
        setTouchStartPosition(null);
        setIsTouching(false);
      }
    },
    [touchStartPosition, handleTouchStart],
  );

  const handleTouchEnd = useCallback(
    (e: React.TouchEvent<HTMLDivElement>) => {
      e.preventDefault();
      if (touchTimeoutRef.current) {
        clearTimeout(touchTimeoutRef.current);
        touchTimeoutRef.current = null;
      }
      if (touchStartTime && Date.now() - touchStartTime < LONG_PRESS_DURATION) {
        // Select only — the right props panel handles editing (no left hijack).
        setSelectedItem({ id: item.id });
      }
      setTouchStartTime(null);
      setTouchStartPosition(null);
      setIsTouching(false);
    },
    [touchStartTime, item.id, setSelectedItem],
  );

  useEffect(() => {
    return () => {
      if (touchTimeoutRef.current) clearTimeout(touchTimeoutRef.current);
    };
  }, []);

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!e.currentTarget) return;
      const rect = e.currentTarget.getBoundingClientRect();
      if (!rect) return;
      const relativeX = e.clientX - rect.left;
      const hoverPosition = item.from + (relativeX / rect.width) * item.durationInFrames;
      onHover(item.id, Math.round(hoverPosition));
    },
    [item, onHover],
  );

  const fillClasses = useMemo(() => v2Fill(item.type), [item.type]);

  const handleSelect = (e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedItem({ id: item.id });
    // Text/video/image/sound/caption are edited in the RIGHT props panel, so
    // selecting them must NOT hijack the left tool panel (that caused a double
    // editor). Only types edited via their LEFT panel force it open.
    if (item.type === OverlayType.HTML_SCENE || item.type === OverlayType.HTML_STICKER) {
      setActivePanel(OverlayType.HTML_SCENE);
      setIsOpen(true);
    }
    if (item.type === OverlayType.TRANSITION) {
      setActivePanel(OverlayType.TRANSITIONS);
      setIsOpen(true);
    }
  };

  // Measure the clip's rendered width so the name only shows when it fits.
  useEffect(() => {
    const el = itemRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver((entries) => {
      for (const e of entries) setClipW(e.contentRect.width);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const showName = clipW >= 56; // enough room for the glyph + a few chars
  const name = clipName(item);
  // Hover reveals the name even on tiles too narrow to show it inline.
  const hoverTitle =
    name ||
    (item.type === OverlayType.TRANSITION
      ? (item as { transitionStyle?: string }).transitionStyle || 'Transition'
      : String(item.type).replace(/-/g, ' '));

  const renderContent = () => {
    return (
      <>
        {/* Background visuals (real, bounded to the clip). */}
        {item.type === OverlayType.SOUND && waveformData && (
          <div className="absolute inset-0 overflow-hidden opacity-70">
            <WaveformVisualizer waveformData={waveformData} totalDuration={totalDuration} durationInFrames={item.durationInFrames} />
          </div>
        )}
        {item.type === OverlayType.VIDEO && (
          <div className="absolute inset-0 overflow-hidden rounded-md">
            <TimelineKeyframes
              overlay={item}
              currentFrame={currentFrame ?? 0}
              zoomScale={zoomScale}
              onLoadingChange={(isLoading) => onAssetLoadingChange?.(item.id, isLoading)}
            />
          </div>
        )}
        {item.type === OverlayType.CAPTION && (
          <div className="absolute inset-0 overflow-hidden">
            <TimelineCaptionBlocks
              captions={(item as CaptionOverlay).captions}
              durationInFrames={item.durationInFrames}
              currentFrame={currentFrame ?? 0}
              startFrame={item.from}
              totalDuration={totalDuration}
            />
          </div>
        )}

        {/* Label row: a tiny glyph (always) + the real name (only when it fits),
            clipped to the tile so nothing ever spills out. Captions render word
            chips above instead of a name. */}
        {item.type !== OverlayType.CAPTION && (
          <div className="pointer-events-none absolute inset-0 z-20 flex items-center gap-1 overflow-hidden px-1.5">
            <span className={cn('shrink-0 rounded-[3px] px-[3px] py-px font-mono text-[7.5px] font-bold leading-none', isSelected ? 'bg-gold/[0.14] text-gold' : 'bg-surface-deeper/80 text-ds-muted')}>
              {GLYPH[item.type] ?? '••'}
            </span>
            {showName && name && item.type !== OverlayType.SOUND && (
              <span className={cn('min-w-0 flex-1 truncate font-mono text-[9px]', isSelected ? 'text-gold' : 'text-ds-secondary')}>{name}</span>
            )}
          </div>
        )}

        {item.keyframeTracks && item.keyframeTracks.length > 0 && (
          <TimelineKeyframeDiamonds overlay={item} itemWidth={100} />
        )}
      </>
    );
  };

  return (
    <TimelineItemContextMenu
      onOpenChange={onContextMenuChange}
      onDeleteItem={(itemId) => {
        if (item.type === OverlayType.VIDEO) keyframeContext.clearKeyframes(String(itemId));
        onDeleteItem(itemId);
      }}
      onDuplicateItem={onDuplicateItem}
      onSplitItem={onSplitItem}
      itemId={item.id}
    >
      <div
        ref={itemRef}
        title={hoverTitle}
        className={`group absolute inset-y-[0.9px] cursor-grab select-none overflow-visible rounded-md pointer-events-auto ${fillClasses} ${
          isDragging && draggedItem?.id === item.id ? 'opacity-50' : ''
        } ${isTouching ? 'scale-[0.98] opacity-80' : ''} ${isSelected ? 'border-2 border-gold' : 'border border-ds-subtle'}`}
        style={{
          left: `${(item.from / totalDuration) * 100}%`,
          width: `${(item.durationInFrames / totalDuration) * 100}%`,
          minWidth: item.type === OverlayType.TRANSITION ? 40 : undefined,
          zIndex: isDragging ? 1 : isSelected ? 45 : item.type === OverlayType.TRANSITION ? 40 : 30,
          transition: `opacity 0.2s ${livePushOffsetPercent !== 0 ? ', transform 0s' : ', transform 0.2s ease-out'}`,
          transform: `translateX(${livePushOffsetPercent}%)`,
          backgroundImage:
            item.type === OverlayType.TRANSITION
              ? 'repeating-linear-gradient(45deg, rgba(212,166,82,0.16) 0px, rgba(212,166,82,0.16) 5px, transparent 5px, transparent 10px)'
              : undefined,
        }}
        onMouseDown={(e) => {
          e.stopPropagation();
          handleItemInteraction(e, 'mousedown');
        }}
        onTouchStart={(e) => {
          e.stopPropagation();
          handleItemInteraction(e, 'touchstart');
        }}
        onTouchMove={handleTouchMove}
        onTouchEnd={(e) => {
          e.stopPropagation();
          handleTouchEnd(e);
        }}
        onClick={(e) => {
          e.stopPropagation();
          handleSelect(e);
        }}
        onMouseMove={handleMouseMove}
      >
        {renderContent()}
        <TimelineItemHandle
          position="left"
          isSelected={isSelected}
          onMouseDown={(e) => {
            e.stopPropagation();
            if (!isSelected) setSelectedItem({ id: item.id });
            handleMouseDown('resize-start', e);
          }}
          onTouchStart={(e) => {
            e.stopPropagation();
            if (!isSelected) setSelectedItem({ id: item.id });
            handleTouchStart('resize-start', e);
          }}
        />
        <TimelineItemHandle
          position="right"
          isSelected={isSelected}
          onMouseDown={(e) => {
            e.stopPropagation();
            if (!isSelected) setSelectedItem({ id: item.id });
            handleMouseDown('resize-end', e);
          }}
          onTouchStart={(e) => {
            e.stopPropagation();
            if (!isSelected) setSelectedItem({ id: item.id });
            handleTouchStart('resize-end', e);
          }}
        />

        {/* L-Cut / J-Cut audio boundary handles for sound overlays. */}
        {item.type === OverlayType.SOUND && (isSelected || item.row === 4) && (
          <>
            <div
              className="group/jcut absolute bottom-0 top-0 cursor-col-resize"
              style={{ right: '100%', width: 12 }}
              title="Drag left to create J-Cut (audio starts before video)"
              onMouseDown={(e) => {
                e.stopPropagation();
                e.preventDefault();
                const startX = e.clientX;
                const currentAudioStart = (item as any).audioStartFrame ?? item.from;
                const parentEl = (e.target as HTMLElement).closest('[class*="absolute inset-y"]')?.parentElement;
                const parentWidth = parentEl?.clientWidth || 600;
                const framesPerPx = totalDuration / parentWidth;
                const handleMove = (moveE: MouseEvent) => {
                  const deltaX = moveE.clientX - startX;
                  const deltaFrames = Math.round(deltaX * framesPerPx);
                  const newAudioStart = Math.max(0, currentAudioStart + deltaFrames);
                  editorChangeOverlay(item.id, { audioStartFrame: Math.min(newAudioStart, item.from) } as any);
                };
                const handleUp = () => {
                  document.removeEventListener('mousemove', handleMove);
                  document.removeEventListener('mouseup', handleUp);
                };
                document.addEventListener('mousemove', handleMove);
                document.addEventListener('mouseup', handleUp);
              }}
            >
              <div className="absolute right-0 top-1/2 h-[60%] w-[3px] -translate-y-1/2 rounded-l bg-blue-500/60 transition-colors group-hover/jcut:bg-blue-400" />
            </div>
            {(item as any).audioStartFrame !== undefined && (item as any).audioStartFrame < item.from && (
              <div
                className="pointer-events-none absolute bottom-0 top-0 rounded-l border-l-2 border-blue-500/40 bg-blue-500/15"
                style={{
                  right: '100%',
                  width: `${(((item.from - (item as any).audioStartFrame) / totalDuration) * 100) / ((item.durationInFrames / totalDuration) * 100) * 100}%`,
                  minWidth: 4,
                }}
              />
            )}
            <div
              className="group/lcut absolute bottom-0 top-0 cursor-col-resize"
              style={{ left: '100%', width: 12 }}
              title="Drag right to create L-Cut (audio continues after video)"
              onMouseDown={(e) => {
                e.stopPropagation();
                e.preventDefault();
                const startX = e.clientX;
                const currentAudioEnd = (item as any).audioEndFrame ?? (item.from + item.durationInFrames);
                const parentEl = (e.target as HTMLElement).closest('[class*="absolute inset-y"]')?.parentElement;
                const parentWidth = parentEl?.clientWidth || 600;
                const framesPerPx = totalDuration / parentWidth;
                const handleMove = (moveE: MouseEvent) => {
                  const deltaX = moveE.clientX - startX;
                  const deltaFrames = Math.round(deltaX * framesPerPx);
                  const newAudioEnd = Math.max(item.from + item.durationInFrames, currentAudioEnd + deltaFrames);
                  editorChangeOverlay(item.id, { audioEndFrame: newAudioEnd } as any);
                };
                const handleUp = () => {
                  document.removeEventListener('mousemove', handleMove);
                  document.removeEventListener('mouseup', handleUp);
                };
                document.addEventListener('mousemove', handleMove);
                document.addEventListener('mouseup', handleUp);
              }}
            >
              <div className="absolute left-0 top-1/2 h-[60%] w-[3px] -translate-y-1/2 rounded-r bg-orange-500/60 transition-colors group-hover/lcut:bg-orange-400" />
            </div>
            {(item as any).audioEndFrame !== undefined && (item as any).audioEndFrame > item.from + item.durationInFrames && (
              <div
                className="pointer-events-none absolute bottom-0 top-0 rounded-r border-r-2 border-orange-500/40 bg-orange-500/15"
                style={{
                  left: '100%',
                  width: `${((((item as any).audioEndFrame - item.from - item.durationInFrames) / totalDuration) * 100) / ((item.durationInFrames / totalDuration) * 100) * 100}%`,
                  minWidth: 4,
                }}
              />
            )}
          </>
        )}
      </div>
    </TimelineItemContextMenu>
  );
};

export default memo(V2TimelineItem);
