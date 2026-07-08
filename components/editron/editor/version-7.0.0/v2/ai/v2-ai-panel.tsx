'use client';

import { useState } from 'react';
import { Sparkles, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Mono } from '@/components/primitives';
import { useEditorContext } from '../../contexts/editor-context';
import { AIChatPanel } from '../../components/ai-chat/ai-chat-panel';
import { AISuggestionsPanel } from '../../components/ai-suggestions/ai-suggestions-panel';

/* ═══ Editron editor v2 · AI panel (300px) ═══════════════════════════
   The v6 "Editron AI" column: Chat / Suggestions / Activity tabs. Chat
   and Suggestions render the REAL context-only panels (kept mounted so
   session + scroll survive tab switches — no logic forked). Activity is
   a v2-native presentational read of the same context state the real
   AIActivityOverlay reads (that overlay is a full-bleed takeover, wrong
   for a 300px tab).

   // TODO(backend): react-video-editor sets `aiActions: []` (hardcoded),
   so Activity stays on its empty state until the chat stream populates
   context.aiActions. */

type Tab = 'chat' | 'suggestions' | 'activity';

const TABS: { id: Tab; label: string }[] = [
  { id: 'chat', label: 'Chat' },
  { id: 'suggestions', label: 'Suggestions' },
  { id: 'activity', label: 'Activity' },
];

type AiAction = { label?: string; status?: string };

function StatusDot({ status }: { status?: string }) {
  if (status === 'done') return <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-gold" />;
  if (status === 'running' || status === 'active') return <span className="h-1.5 w-1.5 shrink-0 rounded-full border-[1.5px] border-gold" />;
  return <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-ds-faint" />;
}

function ActivityTab() {
  const ctx = useEditorContext();
  const isAIProcessing = (ctx as { isAIProcessing?: boolean }).isAIProcessing;
  const actions = ((ctx as { aiActions?: AiAction[] }).aiActions ?? []);

  if (actions.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
        <Mono size="9" className="text-ds-dim">{isAIProcessing ? 'Editron is working…' : 'No AI activity yet'}</Mono>
        <p className="text-[12px] text-ds-faint">Ask Editron to edit, and its steps show here.</p>
      </div>
    );
  }

  const done = actions.filter((a) => a.status === 'done').length;
  const pct = Math.round((done / actions.length) * 100);

  return (
    <div className="flex flex-col gap-2.5 p-3">
      <div className="h-1 w-full overflow-hidden rounded-full bg-surface-well">
        <div className="h-full rounded-full bg-gold transition-[width] duration-300" style={{ width: `${pct}%` }} />
      </div>
      {actions.map((a, i) => (
        <div key={i} className="flex items-center gap-2">
          <StatusDot status={a.status} />
          <span className={cn('text-[12px]', a.status === 'done' ? 'text-ds-muted' : 'text-ds-secondary')}>{a.label ?? 'Step'}</span>
        </div>
      ))}
    </div>
  );
}

export function V2AiPanel({ onClose }: { onClose?: () => void }) {
  const [tab, setTab] = useState<Tab>('chat');

  return (
    <div className="flex w-[300px] shrink-0 flex-col border-l border-ds-subtle bg-surface-raised">
      <div className="border-b border-ds-subtle px-3.5 pt-3">
        <div className="mb-2.5 flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <Sparkles size={14} className="text-gold" />
            <Mono size="10" className="text-gold">Editron AI</Mono>
          </div>
          {onClose && (
            <button type="button" onClick={onClose} title="Close panel (Esc)" className="flex h-6 w-6 items-center justify-center rounded text-ds-muted transition-colors hover:bg-surface-well hover:text-ds-secondary focus-visible:outline-hidden">
              <X size={14} />
            </button>
          )}
        </div>
        <div className="flex gap-0.5">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={cn(
                'border-b-2 px-2.5 py-2 font-mono text-[9px] uppercase tracking-[0.12em] transition-colors focus-visible:outline-hidden',
                tab === t.id ? 'border-gold text-gold' : 'border-transparent text-ds-muted hover:text-ds-secondary',
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="min-h-0 flex-1">
        {/* Chat + Suggestions stay mounted (hidden via CSS) so their state survives tab switches. */}
        <div className={tab === 'chat' ? 'h-full' : 'hidden'}><AIChatPanel /></div>
        <div className={tab === 'suggestions' ? 'h-full' : 'hidden'}><AISuggestionsPanel /></div>
        {tab === 'activity' && <div className="h-full overflow-y-auto"><ActivityTab /></div>}
      </div>
    </div>
  );
}
