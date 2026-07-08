'use client';

import {
  FolderOpen, Type, ImageIcon, Film, Subtitles, Music, Volume2,
  Sticker, ArrowLeftRight, Shapes, Layout, Sparkles, type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Mono } from '@/components/primitives';
import { useSidebar } from '../../contexts/sidebar-context';
import { OverlayType } from '../../types';

/* ═══ Editron editor v2 · tool rail ══════════════════════════════════
   The v6 72px icon rail. Each item drives the REAL editor sidebar
   context (useSidebar().setActivePanel) — the same state v1's AppSidebar
   uses — so the tool panel (V2ToolPanel) shows the matching real panel.
   No logic forked; this is a re-skin of v1's icon nav.

   Deviation from the v6 mock (9 tools): the rail exposes the FULL real
   tool set (Audio + Sound FX, Graphics/Lottie) rather than v6's reduced
   list, so no existing capability is hidden. HTML scenes have no browse
   entry (reached by selecting the overlay), matching v6. The pinned AI
   button toggles the v2 AI panel (aiOpen), mirroring the header's
   "Ask Editron" — it does NOT set activePanel. */

type Tool = { id: string; label: string; icon: LucideIcon; panel: OverlayType };

const TOOLS: Tool[] = [
  { id: 'assets', label: 'Assets', icon: FolderOpen, panel: OverlayType.LOCAL_DIR },
  { id: 'text', label: 'Text', icon: Type, panel: OverlayType.TEXT },
  { id: 'images', label: 'Images', icon: ImageIcon, panel: OverlayType.IMAGE },
  { id: 'video', label: 'Video', icon: Film, panel: OverlayType.VIDEO },
  { id: 'captions', label: 'Captions', icon: Subtitles, panel: OverlayType.CAPTION },
  { id: 'audio', label: 'Audio', icon: Music, panel: OverlayType.SOUND },
  { id: 'sfx', label: 'Sound FX', icon: Volume2, panel: OverlayType.SFX_LIBRARY },
  { id: 'stickers', label: 'Stickers', icon: Sticker, panel: OverlayType.STICKER },
  { id: 'transitions', label: 'Transitions', icon: ArrowLeftRight, panel: OverlayType.TRANSITIONS },
  { id: 'graphics', label: 'Graphics', icon: Shapes, panel: OverlayType.LOTTIE },
  { id: 'templates', label: 'Templates', icon: Layout, panel: OverlayType.TEMPLATE },
];

const railBtn =
  'relative flex flex-col items-center gap-1.5 py-2.5 transition-colors focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-gold/50';

export function V2ToolRail({ aiOpen, onToggleAi, onOpenTool }: { aiOpen: boolean; onToggleAi: () => void; onOpenTool: () => void }) {
  const { activePanel, setActivePanel } = useSidebar();

  return (
    <div className="flex w-[72px] shrink-0 flex-col gap-0.5 overflow-y-auto border-r border-ds-subtle bg-surface-raised py-2">
      {TOOLS.map((t) => {
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
      })}

      <span className="flex-1" />

      <button
        type="button"
        onClick={onToggleAi}
        title="Ask AI"
        className={cn(railBtn, 'border-t border-ds-subtle', aiOpen ? 'text-gold' : 'text-ds-muted hover:text-ds-secondary')}
      >
        {aiOpen && <span className="absolute bottom-2 left-0 top-2 w-0.5 rounded bg-gold" />}
        <Sparkles size={18} strokeWidth={1.5} />
        <Mono size="7" className={aiOpen ? 'text-gold' : 'text-ds-dim'}>AI</Mono>
      </button>
    </div>
  );
}
