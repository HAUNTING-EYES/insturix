'use client';

import { useState } from 'react';
import {
  FolderOpen, Type, ImageIcon, Film, Subtitles, Music, Volume2,
  ArrowLeftRight, Shapes, Sparkles, Plus, Minus, type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Mono } from '@/components/primitives';
import { useSidebar } from '../../contexts/sidebar-context';
import { OverlayType } from '../../types';

/* ═══ Editron editor v2 · tool rail ══════════════════════════════════
   72px icon rail driving the REAL editor sidebar context
   (useSidebar().setActivePanel). Collapsed by default to the core tools
   (Video / Audio / Graphics); a "More" toggle reveals the rest. Stickers
   and Templates are intentionally removed. The pinned AI button toggles
   the right-hand AI chat. */

type Tool = { id: string; label: string; icon: LucideIcon; panel: OverlayType };

const PRIMARY: Tool[] = [
  { id: 'video', label: 'Video', icon: Film, panel: OverlayType.VIDEO },
  { id: 'audio', label: 'Audio', icon: Music, panel: OverlayType.SOUND },
  { id: 'graphics', label: 'Graphics', icon: Shapes, panel: OverlayType.LOTTIE },
];

const SECONDARY: Tool[] = [
  { id: 'assets', label: 'Assets', icon: FolderOpen, panel: OverlayType.LOCAL_DIR },
  { id: 'text', label: 'Text', icon: Type, panel: OverlayType.TEXT },
  { id: 'images', label: 'Images', icon: ImageIcon, panel: OverlayType.IMAGE },
  { id: 'captions', label: 'Captions', icon: Subtitles, panel: OverlayType.CAPTION },
  { id: 'sfx', label: 'Sound FX', icon: Volume2, panel: OverlayType.SFX_LIBRARY },
  { id: 'transitions', label: 'Transitions', icon: ArrowLeftRight, panel: OverlayType.TRANSITIONS },
];

const railBtn =
  'relative flex flex-col items-center gap-1.5 py-2.5 transition-colors focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-gold/50';

export function V2ToolRail({ aiOpen, onToggleAi, onOpenTool }: { aiOpen: boolean; onToggleAi: () => void; onOpenTool: () => void }) {
  const { activePanel, setActivePanel } = useSidebar();
  const [showMore, setShowMore] = useState(false);

  const railItem = (t: Tool) => {
    const active = activePanel === t.panel;
    const Icon = t.icon;
    return (
      <button
        key={t.id}
        type="button"
        onClick={() => { setActivePanel(t.panel); onOpenTool(); }}
        title={t.label}
        className={cn(railBtn, active ? 'text-gold' : 'text-ds-muted hover:text-ds-secondary')}
      >
        {active && <span className="absolute bottom-2 left-0 top-2 w-0.5 rounded bg-gold" />}
        <Icon size={18} strokeWidth={1.5} />
        <Mono size="7" className={active ? 'text-gold' : 'text-ds-dim'}>{t.label}</Mono>
      </button>
    );
  };

  return (
    <div className="flex w-[72px] shrink-0 flex-col gap-0.5 overflow-y-auto border-r border-ds-subtle bg-surface-raised py-2">
      {PRIMARY.map(railItem)}
      {showMore && SECONDARY.map(railItem)}

      <button
        type="button"
        onClick={() => setShowMore((m) => !m)}
        title={showMore ? 'Fewer tools' : 'More tools'}
        className={cn(railBtn, 'text-ds-muted hover:text-ds-secondary')}
      >
        {showMore ? <Minus size={16} strokeWidth={1.5} /> : <Plus size={16} strokeWidth={1.5} />}
        <Mono size="7" className="text-ds-dim">{showMore ? 'Less' : 'More'}</Mono>
      </button>

      <span className="flex-1" />

      <button
        type="button"
        onClick={onToggleAi}
        title="AI chat"
        className={cn(railBtn, 'border-t border-ds-subtle', aiOpen ? 'text-gold' : 'text-ds-muted hover:text-ds-secondary')}
      >
        {aiOpen && <span className="absolute bottom-2 left-0 top-2 w-0.5 rounded bg-gold" />}
        <Sparkles size={18} strokeWidth={1.5} />
        <Mono size="7" className={aiOpen ? 'text-gold' : 'text-ds-dim'}>AI</Mono>
      </button>
    </div>
  );
}
